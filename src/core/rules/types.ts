import type { DistrictIndex } from "../geo/districtIndex.ts";
import type { ThemeMeta } from "../model/row.ts";
import type { RowFacts } from "./facts.ts";

/** 오류: 확실히 잘못됨 / 의심: 사람이 확인해야 함 / 정보: 참고용 */
export type Severity = "error" | "suspect" | "info";

export type Finding = {
  readonly ruleId: string;
  readonly severity: Severity;
  /** 행 키(콘텐츠 ID, 같은 ID가 여럿이면 `ID#순번`). 테마 전체에 대한 지적이면 null. */
  readonly contsId: string | null;
  /** 여러 행·테마 수준 지적을 묶는 키 (예: "25|관악구"). */
  readonly groupKey?: string;
  readonly field?: string;
  readonly value?: string;
  readonly suggestion?: string;
  readonly message: string;
  /** 판정 비교용 지문. 값·메시지·등급은 넣지 않는다. */
  readonly fingerprint: string;
};

/** 규칙이 돌려주는 판정. ruleId·fingerprint는 실행기가 채운다. */
export type FindingDraft = Omit<Finding, "ruleId" | "fingerprint">;

export type RuleContext = {
  readonly theme: ThemeMeta;
  readonly facts: readonly RowFacts[];
  readonly districts: DistrictIndex;
};

export type Rule = {
  readonly id: string;
  readonly title: string;
  check(context: RuleContext): readonly FindingDraft[];
};
