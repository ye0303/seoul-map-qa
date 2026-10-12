import { diffFindings, type FindingDiff } from "../../core/diff/findingDiff.ts";
import { diffSnapshots, separateTimestampChanges, snapshotRowKeys } from "../../core/diff/snapshotDiff.ts";
import { columnLabels } from "../../core/labels/columns.ts";
import type { Snapshot } from "../../core/model/snapshot.ts";
import type { Finding } from "../../core/rules/types.ts";

const NAME_COLUMN = "COT_CONTS_NAME";

/** 행 키와 그 행의 콘텐츠 이름(없으면 null). */
export type RowRef = { readonly key: string; readonly name: string | null };

export type FieldChangeView = { readonly column: string; readonly label: string; readonly before: unknown; readonly after: unknown };

export type RowChangeView = RowRef & { readonly fields: readonly FieldChangeView[] };

export type VersionSide = { readonly snapshot: Snapshot; readonly findings: readonly Finding[] };

/** 두 버전의 차이. 수정일만 바뀐 행은 변경과 따로 센다(D-056). */
export type VersionComparison = {
  readonly added: readonly RowRef[];
  readonly removed: readonly RowRef[];
  readonly modified: readonly RowChangeView[];
  readonly timestampOnly: readonly RowRef[];
  readonly findings: FindingDiff;
};

export function compareVersions(before: VersionSide, after: VersionSide): VersionComparison {
  const { diff, timestampOnly } = separateTimestampChanges(diffSnapshots(before.snapshot, after.snapshot));
  const beforeNames = rowNames(before.snapshot);
  const afterNames = rowNames(after.snapshot);
  const labels = new Map([...columnLabels(before.snapshot), ...columnLabels(after.snapshot)]);
  const ref = (names: ReadonlyMap<string, string | null>) => (key: string): RowRef => ({ key, name: names.get(key) ?? null });
  return {
    added: diff.added.map(ref(afterNames)),
    removed: diff.removed.map(ref(beforeNames)),
    modified: diff.modified.map((change) => ({
      key: change.key,
      name: afterNames.get(change.key) ?? beforeNames.get(change.key) ?? null,
      fields: change.fields.map((field) => ({ ...field, label: labels.get(field.column) ?? field.column })),
    })),
    timestampOnly: timestampOnly.map(ref(afterNames)),
    findings: diffFindings(before.findings, after.findings),
  };
}

/** 행 키 → 콘텐츠 이름. */
export function rowNames(snapshot: Snapshot): Map<string, string | null> {
  const index = snapshot.columns.indexOf(NAME_COLUMN);
  const keys = snapshotRowKeys(snapshot);
  return new Map(
    snapshot.rows.map((row, position) => {
      const name = index === -1 ? null : row[index];
      return [keys[position]!, typeof name === "string" && name.trim() ? name : null];
    }),
  );
}

export type RowField = { readonly column: string; readonly label: string; readonly value: unknown };

/** 판정의 행 키(ID 또는 ID#순번)로 그 행의 모든 열을 한글 이름과 함께 꺼낸다. 없으면 null. */
export function createRowReader(snapshot: Snapshot): (key: string) => RowField[] | null {
  const keys = snapshotRowKeys(snapshot);
  const positions = new Map(keys.map((key, position) => [key, position]));
  const labels = columnLabels(snapshot);
  return (key) => {
    const position = positions.get(key);
    if (position === undefined) return null;
    const row = snapshot.rows[position]!;
    return snapshot.columns.map((column, index) => ({ column, label: labels.get(column) ?? column, value: row[index] }));
  };
}
