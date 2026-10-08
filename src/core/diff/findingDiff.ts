import type { Finding } from "../rules/types.ts";

export type SeverityChange = { readonly before: Finding; readonly after: Finding };

/** 지문(fingerprint) 기준 판정 차이(D-025). 지문에 값이 없어서, 틀린 값이 다른 틀린 값으로 바뀌면 "그대로"다. */
export type FindingDiff = {
  readonly added: readonly Finding[];
  readonly resolved: readonly Finding[];
  /** 같은 지문인데 등급이 바뀐 판정(예: 의심 → 오류). */
  readonly severityChanged: readonly SeverityChange[];
  /** 지문과 등급이 그대로인 판정 수. */
  readonly unchanged: number;
};

export function diffFindings(before: readonly Finding[], after: readonly Finding[]): FindingDiff {
  const previous = new Map(before.map((finding) => [finding.fingerprint, finding]));
  const current = new Set(after.map((finding) => finding.fingerprint));
  const added = after.filter((finding) => !previous.has(finding.fingerprint));
  const resolved = before.filter((finding) => !current.has(finding.fingerprint));
  const severityChanged = after.flatMap((finding): SeverityChange[] => {
    const earlier = previous.get(finding.fingerprint);
    return earlier && earlier.severity !== finding.severity ? [{ before: earlier, after: finding }] : [];
  });
  return { added, resolved, severityChanged, unchanged: after.length - added.length - severityChanged.length };
}

export type CheckedFindings = { readonly rulesetVersion: number; readonly findings: readonly Finding[] };

/**
 * 직전 실행 대비 판정 차이를 데이터 변화와 규칙 변경 영향으로 나눈다(D-025).
 * 규칙 버전이 다르면 직전 데이터를 지금 규칙으로 다시 검사(recheckPrevious)해,
 * 직전 판정 → 재검사 결과는 규칙 변경 영향, 재검사 결과 → 지금 판정은 데이터 변화로 센다.
 */
export function splitFindingChanges(
  previous: CheckedFindings,
  current: CheckedFindings,
  recheckPrevious: () => readonly Finding[],
): { readonly data: FindingDiff; readonly rules: FindingDiff | null } {
  if (previous.rulesetVersion === current.rulesetVersion) return { data: diffFindings(previous.findings, current.findings), rules: null };
  const rechecked = recheckPrevious();
  return { data: diffFindings(rechecked, current.findings), rules: diffFindings(previous.findings, rechecked) };
}
