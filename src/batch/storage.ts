import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Snapshot } from "../core/model/snapshot.ts";
import type { Finding } from "../core/rules/types.ts";
import type { Department } from "./departments.ts";

/** 스냅샷 한 파일의 최대 행 수. 가장 큰 테마(3.5만 행)도 파일당 12MB 안쪽이라 Pages 한도(25MiB) 아래다. */
export const SHARD_ROWS = 10_000;

export type ThemeStatus = "ok" | "unavailable" | "incomplete" | "error" | "missing";

export type FindingCounts = { readonly error: number; readonly suspect: number; readonly info: number };
export type RowChangeCounts = { readonly added: number; readonly removed: number; readonly modified: number };
export type FindingChangeCounts = { readonly added: number; readonly resolved: number; readonly severityChanged: number };

/** 마지막으로 받은 상태 대비 이번 실행의 변화(D-025, D-043). */
export type ThemeChange = {
  /** 비교한 상태를 받은 실행 ID(보통 직전 실행). */
  readonly since: string;
  /** 행 변화. 내용이 바뀌었는데 이전 스냅샷을 읽지 못하면 null. */
  readonly rows: RowChangeCounts | null;
  /** 데이터가 바뀌어 생긴 판정 변화. 이전 판정이 없으면 null. */
  readonly findings: FindingChangeCounts | null;
  /** 규칙 버전이 바뀐 실행에서만: 같은 데이터에 새 규칙을 적용해 생긴 판정 변화. */
  readonly rulesEffect?: FindingChangeCounts;
};

/** data/versions/{테마ID}.json의 한 항목. 내용이 바뀐 실행마다 하나(D-018). */
export type VersionEntry = {
  /** 실행 ID. */
  readonly version: string;
  /** 그 실행 커밋의 git 태그. raw.githubusercontent.com/{owner}/{repo}/{tag}/data/… 로 그때 파일을 읽는다. */
  readonly tag: string;
  readonly rowCount: number;
  readonly contentHash: string;
  readonly counts: FindingCounts;
  /** 직전 버전 대비 행 변화. 첫 버전이면 null. */
  readonly rows: RowChangeCounts | null;
};

export type StoredResults = {
  readonly themeId: string;
  readonly rulesetVersion: number;
  readonly contentHash: string;
  readonly findings: readonly Finding[];
};

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
  /** 이번 실행에서 받은 테마만: 마지막으로 받은 상태 대비 변화. */
  readonly change?: ThemeChange;
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
  /** 이 실행 커밋에 붙이는 git 태그. */
  readonly tag: string;
  /** 직전 실행. 첫 실행이면 null. */
  readonly previous: { readonly runId: string; readonly tag: string } | null;
  /** 이번 실행에서 비교한 테마들의 변화 합계. 비교한 테마가 없으면 null. */
  readonly changes: {
    readonly themesChanged: number;
    readonly rows: RowChangeCounts;
    readonly findings: FindingChangeCounts;
    readonly rulesEffect?: FindingChangeCounts;
  } | null;
};

/** 이전 실행 정보. M2 실행(태그 도입 전)에는 tag가 없다. */
export type PreviousRun = { readonly runId: string; readonly tag?: string };

/** 테마 하나의 저장 내용. 시각은 넣지 않아 내용이 같으면 파일도 바이트 단위로 같다. */
export type ThemeFiles = {
  readonly meta: unknown;
  readonly shards: readonly string[];
  readonly results: StoredResults;
  /** 버전 목록이 바뀌었을 때만. */
  readonly versions?: readonly VersionEntry[];
};

export type Store = {
  readThemes(): ThemeEntry[] | null;
  readRun(): PreviousRun | null;
  /** 마지막으로 저장된 스냅샷(meta.json + 조각). 없으면 null. */
  readSnapshot(themeId: string): Snapshot | null;
  readResults(themeId: string): StoredResults | null;
  readVersions(themeId: string): VersionEntry[];
  writeTheme(themeId: string, files: ThemeFiles): void;
  writeThemes(entries: readonly ThemeEntry[]): void;
  writeRun(run: RunInfo): void;
};

export function createStore(dataDir: string): Store {
  return {
    readThemes() {
      return readJson<ThemeEntry[]>(join(dataDir, "themes.json"));
    },
    readRun() {
      return readJson<PreviousRun>(join(dataDir, "run.json"));
    },
    readSnapshot(themeId) {
      const snapshotDir = join(dataDir, "snapshots", themeId);
      const meta = readJson<{ readonly columns: readonly string[]; readonly shards: number }>(join(snapshotDir, "meta.json"));
      if (!meta) return null;
      const rows: unknown[][] = [];
      for (let index = 0; index < meta.shards; index++) {
        for (const line of readFileSync(join(snapshotDir, shardName(index)), "utf8").split("\n")) {
          if (line) rows.push(JSON.parse(line) as unknown[]);
        }
      }
      return { columns: meta.columns, rows };
    },
    readResults(themeId) {
      return readJson<StoredResults>(join(dataDir, "results", `${themeId}.json`));
    },
    readVersions(themeId) {
      return readJson<VersionEntry[]>(join(dataDir, "versions", `${themeId}.json`)) ?? [];
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
      if (files.versions) {
        mkdirSync(join(dataDir, "versions"), { recursive: true });
        writeJson(join(dataDir, "versions", `${themeId}.json`), files.versions);
      }
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

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
}
