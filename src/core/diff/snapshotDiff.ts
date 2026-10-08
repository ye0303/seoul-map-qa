import type { ContentRow } from "../model/row.ts";
import { compareCodeUnits, type Snapshot } from "../model/snapshot.ts";

const ID_COLUMN = "COT_CONTS_ID";

export type FieldChange = { readonly column: string; readonly before: unknown; readonly after: unknown };
export type RowChange = { readonly key: string; readonly fields: readonly FieldChange[] };

/** 행 키(콘텐츠 ID, 같은 ID가 여럿이면 ID#n) 기준 차이. 한쪽에만 있는 열의 값은 undefined다. */
export type SnapshotDiff = {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly modified: readonly RowChange[];
};

/**
 * 스냅샷 행 키. 같은 ID의 행은 스냅샷 저장 순서(compareRows)대로 ID#1, ID#2… 판정의 contsId와 같은 행을 가리킨다.
 */
export function snapshotRowKeys(snapshot: Snapshot): string[] {
  const idIndex = snapshot.columns.indexOf(ID_COLUMN);
  const ids = snapshot.rows.map((row) => (idIndex === -1 ? "" : String(row[idIndex] ?? "")));
  const totals = new Map<string, number>();
  for (const id of ids) totals.set(id, (totals.get(id) ?? 0) + 1);
  const seen = new Map<string, number>();
  return ids.map((id) => {
    if ((totals.get(id) ?? 0) < 2) return id;
    const order = (seen.get(id) ?? 0) + 1;
    seen.set(id, order);
    return `${id}#${order}`;
  });
}

/** 스냅샷을 규칙이 읽는 행 객체로 되돌린다. 과거 버전을 지금 규칙으로 다시 검사할 때 쓴다. */
export function rowsFromSnapshot(snapshot: Snapshot): ContentRow[] {
  return snapshot.rows.map((values) => Object.fromEntries(snapshot.columns.map((column, index) => [column, values[index] ?? null])));
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const previous = indexRows(before);
  const current = indexRows(after);
  const columns = [...new Set([...before.columns, ...after.columns])].sort(compareCodeUnits);
  const added = [...current.keys()].filter((key) => !previous.has(key));
  const removed = [...previous.keys()].filter((key) => !current.has(key));
  const modified: RowChange[] = [];
  for (const [key, afterRow] of current) {
    const beforeRow = previous.get(key);
    if (!beforeRow) continue;
    const fields = columns.flatMap((column): FieldChange[] => {
      const beforeValue = beforeRow(column);
      const afterValue = afterRow(column);
      return sameValue(beforeValue, afterValue) ? [] : [{ column, before: beforeValue, after: afterValue }];
    });
    if (fields.length > 0) modified.push({ key, fields });
  }
  return { added, removed, modified };
}

/** 행 키 → (열 이름 → 값) 조회 함수. */
function indexRows(snapshot: Snapshot): Map<string, (column: string) => unknown> {
  const position = new Map(snapshot.columns.map((column, index) => [column, index]));
  const keys = snapshotRowKeys(snapshot);
  return new Map(
    snapshot.rows.map((row, index) => {
      const read = (column: string) => {
        const at = position.get(column);
        return at === undefined ? undefined : row[at];
      };
      return [keys[index]!, read];
    }),
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  return typeof a === "object" && typeof b === "object" && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}
