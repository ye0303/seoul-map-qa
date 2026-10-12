import { missingName, sharedImage } from "./common/contents.ts";
import { missingCoordinate, outOfRangeCoordinate, outsideSeoul, swappedCoordinate } from "./common/coordinates.ts";
import { districtEmpty, districtMismatchAddress, districtMismatchCoordinate } from "./common/districts.ts";
import { duplicateEntry, duplicateId, nearbySameName } from "./common/duplicates.ts";
import { phoneFormat } from "./common/phone.ts";
import { EDITION25_RULES, EDITION25_THEME_ID } from "./themes/edition25.ts";
import type { Rule } from "./types.ts";

/** 규칙을 바꾸면 올린다. 판정 비교 때 규칙 변경 영향과 데이터 변화를 나누는 기준이다. */
export const RULESET_VERSION = 1;

export const COMMON_RULES: readonly Rule[] = [
  missingCoordinate,
  swappedCoordinate,
  outOfRangeCoordinate,
  outsideSeoul,
  districtMismatchCoordinate,
  districtMismatchAddress,
  districtEmpty,
  duplicateEntry,
  nearbySameName,
  phoneFormat,
  missingName,
  sharedImage,
  duplicateId,
];

export type ThemeRuleSet = {
  readonly themeId: string;
  readonly themeName: string;
  readonly rules: readonly Rule[];
  /** 테마 규칙이 대신하는 공통 규칙. */
  readonly replaces: readonly string[];
};

/** 특정 테마에만 붙는 규칙. 담당자에게 규칙을 받으면 여기에 더한다(D-007). */
export const THEME_RULE_SETS: readonly ThemeRuleSet[] = [
  { themeId: EDITION25_THEME_ID, themeName: "서울에디션25", rules: EDITION25_RULES, replaces: ["C-12"] },
];

export function rulesFor(themeId: string): readonly Rule[] {
  const theme = THEME_RULE_SETS.find((set) => set.themeId === themeId);
  if (!theme) return COMMON_RULES;
  return [...COMMON_RULES.filter((rule) => !theme.replaces.includes(rule.id)), ...theme.rules];
}
