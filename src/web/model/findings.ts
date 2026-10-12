import type { FindingCounts } from "../../core/model/dataFiles.ts";
import { COMMON_RULES, THEME_RULE_SETS } from "../../core/rules/registry.ts";
import type { Finding, Severity } from "../../core/rules/types.ts";
import { SEVERITY_ORDER } from "./summary.ts";

const RULE_TITLES = new Map([...COMMON_RULES, ...THEME_RULE_SETS.flatMap((set) => set.rules)].map((rule) => [rule.id, rule.title]));

export function ruleTitle(ruleId: string): string {
  return RULE_TITLES.get(ruleId) ?? ruleId;
}

export type FindingFilter = {
  readonly severity: Severity | "all";
  /** 빈 값이면 모든 규칙. */
  readonly ruleId: string;
  readonly onlyNew: boolean;
  /** 콘텐츠 이름·ID·값·내용에서 찾을 말. */
  readonly query: string;
};

export const NO_FILTER: FindingFilter = { severity: "all", ruleId: "", onlyNew: false, query: "" };

/** 거른 판정을 오류 → 의심 → 정보 순으로(같은 등급은 저장 순서: 규칙 → 콘텐츠 ID). */
export function filterFindings(findings: readonly Finding[], filter: FindingFilter, newFingerprints: ReadonlySet<string> | null): Finding[] {
  const needle = compact(filter.query);
  return findings
    .filter(
      (finding) =>
        (filter.severity === "all" || finding.severity === filter.severity) &&
        (!filter.ruleId || finding.ruleId === filter.ruleId) &&
        (!filter.onlyNew || (newFingerprints?.has(finding.fingerprint) ?? false)) &&
        (!needle || [finding.name, finding.contsId, finding.value, finding.message].some((text) => text && compact(text).includes(needle))),
    )
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

/** 규칙별 판정 수(규칙 ID순). 규칙 거르기 목록에 쓴다. */
export function countByRule(findings: readonly Finding[]): { readonly ruleId: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const finding of findings) counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([ruleId, count]) => ({ ruleId, count }));
}

export function countBySeverity(findings: readonly Finding[]): FindingCounts {
  const counts = { error: 0, suspect: 0, info: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

function compact(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}
