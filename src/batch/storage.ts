import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PreviousRun, RunInfo, StoredResults, ThemeEntry, VersionEntry } from "../core/model/dataFiles.ts";
import type { Snapshot } from "../core/model/snapshot.ts";

/** 스냅샷 한 파일의 최대 행 수. 가장 큰 테마(3.5만 행)도 파일당 12MB 안쪽이라 Pages 한도(25MiB) 아래다. */
export const SHARD_ROWS = 10_000;

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
