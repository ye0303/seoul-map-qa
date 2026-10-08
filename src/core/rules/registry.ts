import { missingCoordinate, outOfRangeCoordinate, outsideSeoul, swappedCoordinate } from "./common/coordinates.ts";
import { districtEmpty, districtMismatchAddress, districtMismatchCoordinate } from "./common/districts.ts";
import { duplicateEntry, duplicateId, nearbySameName } from "./common/duplicates.ts";
import { phoneFormat } from "./common/phone.ts";
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
  duplicateId,
];

type ThemeRules = {
  readonly rules: readonly Rule[];
  /** 테마 규칙이 대신하는 공통 규칙. */
  readonly replaces?: readonly string[];
};

const THEME_RULES: Readonly<Record<string, ThemeRules>> = {};

export function rulesFor(themeId: string): readonly Rule[] {
  const theme = THEME_RULES[themeId];
  if (!theme) return COMMON_RULES;
  return [...COMMON_RULES.filter((rule) => !theme.replaces?.includes(rule.id)), ...theme.rules];
}
