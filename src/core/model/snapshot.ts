import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { ContentRow } from "./row.ts";

/** 호출할 때마다 바뀌는 필드(검색 기준점 거리, 순번). 스냅샷·비교에서 뺀다. */
export const VOLATILE_COLUMNS: readonly string[] = ["DIST", "RNUM"];

const ID_COLUMN = "COT_CONTS_ID";

/** 테마 한 개의 정규화된 내용. 열은 이름순, 행은 콘텐츠 ID순(같은 ID는 행 서명순). */
export type Snapshot = {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
};

export function normalizeRows(rows: readonly ContentRow[]): Snapshot {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    .filter((column) => !VOLATILE_COLUMNS.includes(column))
    .sort(compareCodeUnits);
  const ordered = [...rows].sort(compareRows);
  return { columns, rows: ordered.map((row) => columns.map((column) => row[column] ?? null)) };
}

/** 정규화된 내용의 sha256(hex). 같은 내용이면 행 순서·DIST·RNUM과 관계없이 같다. */
export function contentHash(snapshot: Snapshot): string {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(snapshot))));
}

/** 콘텐츠 ID순, 같은 ID면 행 서명순. 스냅샷 행 순서와 중복 ID 순번(`ID#n`)이 이 순서를 같이 쓴다. */
export function compareRows(a: ContentRow, b: ContentRow): number {
  return compareCodeUnits(rowId(a), rowId(b)) || compareCodeUnits(rowSignature(a), rowSignature(b));
}

/** DIST·RNUM을 뺀 행 내용을 열 이름순으로 직렬화한 문자열. */
export function rowSignature(row: ContentRow): string {
  return JSON.stringify(
    Object.keys(row)
      .filter((column) => !VOLATILE_COLUMNS.includes(column))
      .sort(compareCodeUnits)
      .map((column) => row[column] ?? null),
  );
}

/** 로캘과 무관하게 항상 같은 결과를 내는 문자열 비교. */
export function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function rowId(row: ContentRow): string {
  return String(row[ID_COLUMN] ?? "");
}
