import type { FindingCounts, ThemeEntry, ThemeStatus } from "../../core/model/dataFiles.ts";
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

/** 이번 실행에서 검사하지 못한 테마(권한 없음·실패 등). */
export function uncheckedThemes(themes: readonly ThemeEntry[]): ThemeEntry[] {
  return themes.filter((entry) => entry.status !== "ok").sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name, "ko"));
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
