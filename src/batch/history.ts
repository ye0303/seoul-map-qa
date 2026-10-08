import { splitFindingChanges, type FindingDiff } from "../core/diff/findingDiff.ts";
import { diffSnapshots, rowsFromSnapshot } from "../core/diff/snapshotDiff.ts";
import type { ContentRow } from "../core/model/row.ts";
import type { Snapshot } from "../core/model/snapshot.ts";
import { RULESET_VERSION } from "../core/rules/registry.ts";
import type { Finding } from "../core/rules/types.ts";
import type { FindingChangeCounts, FindingCounts, RowChangeCounts, Store, ThemeChange, ThemeEntry, VersionEntry } from "./storage.ts";

/** 실행 ID("2026-10-08T14:58") → git 태그("snap-2026-10-08-1458"). 태그 이름에는 ":"를 쓸 수 없다. */
export function runTag(runId: string): string {
  return `snap-${runId.replace("T", "-").replace(":", "")}`;
}

export type CurrentState = {
  readonly runId: string;
  readonly snapshot: Snapshot;
  readonly contentHash: string;
  readonly counts: FindingCounts;
  readonly findings: readonly Finding[];
};

export type ThemeHistory = {
  /** themes.json에 남길 변화. 비교할 이전 상태가 없으면 null. */
  readonly change: ThemeChange | null;
  /** 새 버전 목록. 바뀌지 않았으면 null(파일을 그대로 둔다). */
  readonly versions: readonly VersionEntry[] | null;
  /** 내용이 바뀌었는지(실행 합계용). */
  readonly contentChanged: boolean;
};

/**
 * 테마를 마지막으로 받은 상태(디스크의 스냅샷·판정 = 마지막 성공 실행)와 비교한다.
 * 내용이 바뀌었으면 새 버전을 붙인다. 버전 목록이 아직 없으면(M2 데이터) 마지막으로 받은 상태를 첫 버전으로 삼는다.
 */
export function compareWithPrevious(
  store: Store,
  themeId: string,
  before: ThemeEntry | undefined,
  current: CurrentState,
  recheck: (rows: readonly ContentRow[]) => readonly Finding[],
): ThemeHistory {
  const existing = store.readVersions(themeId);
  const currentVersion = (rows: RowChangeCounts | null): VersionEntry => ({
    version: current.runId,
    tag: runTag(current.runId),
    rowCount: current.snapshot.rows.length,
    contentHash: current.contentHash,
    counts: current.counts,
    rows,
  });

  if (!before?.contentHash || !before.counts || before.rowCount === null || !before.lastSuccessAt) {
    // 비교할 이전 상태가 없다(첫 실행, 처음 받은 테마). 첫 버전만 남긴다.
    const unchanged = existing.at(-1)?.contentHash === current.contentHash;
    return { change: null, versions: unchanged ? null : [...existing, currentVersion(null)], contentChanged: false };
  }

  const since = koreanMinute(new Date(before.lastSuccessAt));
  const contentChanged = before.contentHash !== current.contentHash;
  const previousResults = store.readResults(themeId);
  const rulesChanged = previousResults !== null && previousResults.rulesetVersion !== RULESET_VERSION;
  const previousSnapshot = contentChanged || rulesChanged ? store.readSnapshot(themeId) : null;

  const rows = contentChanged ? (previousSnapshot ? countRows(diffSnapshots(previousSnapshot, current.snapshot)) : null) : { added: 0, removed: 0, modified: 0 };
  const split = previousResults
    ? splitFindingChanges(previousResults, { rulesetVersion: RULESET_VERSION, findings: current.findings }, () =>
        previousSnapshot ? recheck(rowsFromSnapshot(previousSnapshot)) : previousResults.findings,
      )
    : null;
  const change: ThemeChange = {
    since,
    rows,
    findings: split ? countFindings(split.data) : null,
    ...(split?.rules ? { rulesEffect: countFindings(split.rules) } : {}),
  };

  const base: readonly VersionEntry[] =
    existing.length > 0
      ? existing
      : [{ version: since, tag: runTag(since), rowCount: before.rowCount, contentHash: before.contentHash, counts: before.counts, rows: null }];
  const versions = contentChanged ? [...base, currentVersion(rows)] : existing.length > 0 ? null : base;
  return { change, versions, contentChanged };
}

function countRows(diff: ReturnType<typeof diffSnapshots>): RowChangeCounts {
  return { added: diff.added.length, removed: diff.removed.length, modified: diff.modified.length };
}

function countFindings(diff: FindingDiff): FindingChangeCounts {
  return { added: diff.added.length, resolved: diff.resolved.length, severityChanged: diff.severityChanged.length };
}

/** 한국 시각 기준 "YYYY-MM-DDTHH:mm". 실행 ID이자 버전 이름(실행 시작 시각 기준). */
export function koreanMinute(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}`;
}
