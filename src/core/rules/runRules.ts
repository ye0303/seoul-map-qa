import type { DistrictIndex } from "../geo/districtIndex.ts";
import type { ThemeData } from "../model/row.ts";
import { compareCodeUnits } from "../model/snapshot.ts";
import { buildFacts } from "./facts.ts";
import { rulesFor } from "./registry.ts";
import type { Finding } from "./types.ts";

export type RefData = {
  readonly districts: DistrictIndex;
};

/** 테마 하나를 검사한다. 같은 입력이면 항상 같은 순서의 같은 결과를 낸다(배치·브라우저 공통). */
export function runRules(theme: ThemeData, ref: RefData): Finding[] {
  const context = { theme: theme.meta, facts: buildFacts(theme.rows, ref.districts), districts: ref.districts };
  const findings = rulesFor(theme.meta.id).flatMap((rule) =>
    rule.check(context).map(
      (draft): Finding => ({
        ruleId: rule.id,
        ...draft,
        fingerprint: [rule.id, theme.meta.id, draft.contsId ?? "", draft.groupKey ?? "", draft.field ?? ""].join("|"),
      }),
    ),
  );
  return findings.sort(
    (a, b) =>
      compareCodeUnits(a.ruleId, b.ruleId) ||
      compareCodeUnits(a.contsId ?? "", b.contsId ?? "") ||
      compareCodeUnits(a.groupKey ?? "", b.groupKey ?? "") ||
      compareCodeUnits(a.field ?? "", b.field ?? ""),
  );
}
