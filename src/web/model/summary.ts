import type { FindingCounts, RowChangeCounts, ThemeChange, ThemeEntry, ThemeStatus } from "../../core/model/dataFiles.ts";
import type { Severity } from "../../core/rules/types.ts";

export const UNKNOWN_DEPARTMENT = "담당 미상";

export const STATUS_LABEL: Readonly<Record<ThemeStatus, string>> = {
  ok: "검사 완료",
  unavailable: "권한 없음",
  incomplete: "불완전",
  error: "수집 실패",
  missing: "목록에서 빠짐",
};

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = { error: "오류", suspect: "의심", info: "정보" };

export const SEVERITY_ORDER: readonly Severity[] = ["error", "suspect", "info"];

/** 테마 상태: 이번 검사에서 받지 못했으면 "검사 못함", 아니면 가장 높은 등급. */
export type Health = Severity | "clean" | "unchecked";

export const HEALTH_ORDER: readonly Health[] = ["error", "suspect", "info", "clean", "unchecked"];

export const HEALTH_LABEL: Readonly<Record<Health, string>> = {
  error: "오류 있음",
  suspect: "의심만",
  info: "정보만",
  clean: "문제 없음",
  unchecked: "검사 못함",
};

export function healthOf(entry: ThemeEntry): Health {
  if (entry.status !== "ok" || !entry.counts) return "unchecked";
  const { error, suspect, info } = entry.counts;
  return error > 0 ? "error" : suspect > 0 ? "suspect" : info > 0 ? "info" : "clean";
}

/** 상태별 테마(각 목록은 오류·의심 많은 순). */
export function groupByHealth(themes: readonly ThemeEntry[]): Map<Health, ThemeEntry[]> {
  const groups = new Map<Health, ThemeEntry[]>(HEALTH_ORDER.map((health) => [health, []]));
  for (const entry of sortThemes(themes)) groups.get(healthOf(entry))!.push(entry);
  return groups;
}

/** 등급별로 그 등급 판정이 하나라도 있는 테마 수(이번 검사에서 받은 테마만). */
export function themesWithSeverity(themes: readonly ThemeEntry[]): FindingCounts {
  const checked = themes.filter((entry) => entry.status === "ok" && entry.counts);
  const count = (severity: Severity) => checked.filter((entry) => entry.counts![severity] > 0).length;
  return { error: count("error"), suspect: count("suspect"), info: count("info") };
}

/** 추가·삭제·변경 행 수의 합. 수정일만 바뀐 행은 넣지 않는다(D-056). */
export function rowChangeTotal(rows: RowChangeCounts): number {
  return rows.added + rows.removed + rows.modified;
}

/** 판정 변화 합계(데이터 변화 + 규칙 변경 영향). */
export function findingChangeTotal(change: ThemeChange): number {
  const sum = (counts: ThemeChange["rulesEffect"] | null) => (counts ? counts.added + counts.resolved + counts.severityChanged : 0);
  return sum(change.findings) + sum(change.rulesEffect);
}

export type ChangedThemes = {
  /** 콘텐츠나 판정이 바뀐 테마. 바뀐 행이 많은 순. */
  readonly changed: readonly ThemeEntry[];
  /** 수정일만 바뀌고 내용·판정은 그대로인 테마. */
  readonly datesOnly: readonly ThemeEntry[];
};

/** 이번 검사에서 직전 상태 대비 바뀐 테마. 행 변화가 null이면 내용은 바뀌었는데 행 수를 모르는 경우다. */
export function changedThemes(themes: readonly ThemeEntry[]): ChangedThemes {
  const changed: ThemeEntry[] = [];
  const datesOnly: ThemeEntry[] = [];
  for (const entry of themes) {
    const change = entry.change;
    if (!change) continue;
    if (change.rows === null || rowChangeTotal(change.rows) > 0 || findingChangeTotal(change) > 0) changed.push(entry);
    else if ((change.rows.datesOnly ?? 0) > 0) datesOnly.push(entry);
  }
  const size = (entry: ThemeEntry) => (entry.change?.rows ? rowChangeTotal(entry.change.rows) : Number.MAX_SAFE_INTEGER);
  return {
    changed: changed.sort((a, b) => size(b) - size(a) || a.name.localeCompare(b.name, "ko")),
    datesOnly: datesOnly.sort((a, b) => a.name.localeCompare(b.name, "ko")),
  };
}

export type DepartmentSummary = {
  readonly name: string;
  readonly themes: number;
  readonly checked: number;
  readonly counts: FindingCounts;
  /** 직전 검사 대비 새로 생긴 판정(데이터 변화 기준). */
  readonly added: number;
  readonly resolved: number;
};

export function departmentOf(entry: ThemeEntry): string {
  return entry.department?.label ?? UNKNOWN_DEPARTMENT;
}

/** 담당 과별 합계. 오류가 많은 과부터, 같으면 의심이 많은 과부터. 담당 미상은 맨 뒤. */
export function summarizeDepartments(themes: readonly ThemeEntry[]): DepartmentSummary[] {
  const byName = new Map<string, ThemeEntry[]>();
  for (const entry of themes) {
    const name = departmentOf(entry);
    (byName.get(name) ?? byName.set(name, []).get(name)!).push(entry);
  }
  return [...byName]
    .map(([name, entries]): DepartmentSummary => ({
      name,
      themes: entries.length,
      checked: entries.filter((entry) => entry.status === "ok").length,
      counts: sumCounts(entries),
      added: entries.reduce((sum, entry) => sum + (entry.change?.findings?.added ?? 0), 0),
      resolved: entries.reduce((sum, entry) => sum + (entry.change?.findings?.resolved ?? 0), 0),
    }))
    .sort(
      (a, b) =>
        Number(a.name === UNKNOWN_DEPARTMENT) - Number(b.name === UNKNOWN_DEPARTMENT) ||
        b.counts.error - a.counts.error ||
        b.counts.suspect - a.counts.suspect ||
        a.name.localeCompare(b.name, "ko"),
    );
}

/** 테마 목록을 오류·의심이 많은 순으로. */
export function sortThemes(themes: readonly ThemeEntry[]): ThemeEntry[] {
  return [...themes].sort(
    (a, b) => (b.counts?.error ?? -1) - (a.counts?.error ?? -1) || (b.counts?.suspect ?? -1) - (a.counts?.suspect ?? -1) || a.name.localeCompare(b.name, "ko"),
  );
}

/** 이름에 검색어가 들어 있는 테마(띄어쓰기·대소문자 무시). */
export function searchThemes(themes: readonly ThemeEntry[], query: string): ThemeEntry[] {
  const needle = compact(query);
  if (!needle) return [];
  return sortThemes(themes.filter((entry) => compact(entry.name).includes(needle) || compact(departmentOf(entry)).includes(needle)));
}

function compact(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

function sumCounts(entries: readonly ThemeEntry[]): FindingCounts {
  return entries.reduce(
    (sum, entry) => ({
      error: sum.error + (entry.counts?.error ?? 0),
      suspect: sum.suspect + (entry.counts?.suspect ?? 0),
      info: sum.info + (entry.counts?.info ?? 0),
    }),
    { error: 0, suspect: 0, info: 0 },
  );
}
