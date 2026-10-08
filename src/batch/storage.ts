import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Department } from "./departments.ts";

/** 스냅샷 한 파일의 최대 행 수. 가장 큰 테마(3.5만 행)도 파일당 12MB 안쪽이라 Pages 한도(25MiB) 아래다. */
export const SHARD_ROWS = 10_000;

export type ThemeStatus = "ok" | "unavailable" | "incomplete" | "error" | "missing";

export type FindingCounts = { readonly error: number; readonly suspect: number; readonly info: number };

/** data/themes.json의 한 항목. 수집에 실패하면 행 수·해시·판정 수는 마지막 성공 값을 유지한다. */
export type ThemeEntry = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: ThemeStatus;
  readonly statusReason?: string;
  readonly rowCount: number | null;
  readonly contentHash: string | null;
  readonly counts: FindingCounts | null;
  readonly lastSuccessAt: string | null;
  readonly department: Department | null;
  /** 이번 실행에서 담당 부서를 받지 못해 이전 값을 쓴 경우. */
  readonly departmentStale?: true;
};

export type RunInfo = {
  /** 한국 시각 "2026-10-08T15:30". 버전 이름에 쓴다. */
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationSec: number;
  readonly rulesetVersion: number;
  readonly themes: Readonly<Record<"public" | ThemeStatus, number>>;
  readonly rows: number;
  readonly findings: FindingCounts;
  readonly departments: "ok" | "stale";
};

/** 테마 하나의 저장 내용. 시각은 넣지 않아 내용이 같으면 파일도 바이트 단위로 같다. */
export type ThemeFiles = {
  readonly meta: unknown;
  readonly shards: readonly string[];
  readonly results: unknown;
};

export type Store = {
  readThemes(): ThemeEntry[] | null;
  writeTheme(themeId: string, files: ThemeFiles): void;
  writeThemes(entries: readonly ThemeEntry[]): void;
  writeRun(run: RunInfo): void;
};

export function createStore(dataDir: string): Store {
  return {
    readThemes() {
      try {
        return JSON.parse(readFileSync(join(dataDir, "themes.json"), "utf8")) as ThemeEntry[];
      } catch {
        return null;
      }
    },
    writeTheme(themeId, files) {
      const snapshotDir = join(dataDir, "snapshots", themeId);
      mkdirSync(snapshotDir, { recursive: true });
      writeJson(join(snapshotDir, "meta.json"), files.meta);
      const keep = new Set(files.shards.map((_, index) => shardName(index)));
      files.shards.forEach((shard, index) => writeFileSync(join(snapshotDir, shardName(index)), shard));
      for (const name of readdirSync(snapshotDir)) {
        if (/^rows-\d{3}\.ndjson$/.test(name) && !keep.has(name)) rmSync(join(snapshotDir, name));
      }
      mkdirSync(join(dataDir, "results"), { recursive: true });
      writeJson(join(dataDir, "results", `${themeId}.json`), files.results);
    },
    writeThemes(entries) {
      writeJson(join(dataDir, "themes.json"), entries);
    },
    writeRun(run) {
      writeJson(join(dataDir, "run.json"), run);
    },
  };
}

/** 정규화된 행들을 SHARD_ROWS씩 나눈 NDJSON(한 줄에 한 행, 열 순서는 meta.json의 columns). */
export function toShards(rows: readonly (readonly unknown[])[], shardRows = SHARD_ROWS): string[] {
  const shards: string[] = [];
  for (let start = 0; start < rows.length; start += shardRows) {
    shards.push(rows.slice(start, start + shardRows).map((row) => `${JSON.stringify(row)}\n`).join(""));
  }
  return shards;
}

function shardName(index: number): string {
  return `rows-${String(index).padStart(3, "0")}.ndjson`;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
}
