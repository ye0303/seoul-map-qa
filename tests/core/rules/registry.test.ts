import { expect, test } from "vitest";

import { COMMON_RULES, rulesFor, THEME_RULE_SETS } from "../../../src/core/rules/registry.ts";
import { EDITION25_THEME_ID } from "../../../src/core/rules/themes/edition25.ts";

const allRules = [...COMMON_RULES, ...THEME_RULE_SETS.flatMap((set) => set.rules)];

test("모든 규칙에 ID가 겹치지 않고 제목·설명이 있다(규칙 안내 화면)", () => {
  expect(new Set(allRules.map((rule) => rule.id)).size).toBe(allRules.length);
  for (const rule of allRules) {
    expect(rule.title.trim()).not.toBe("");
    expect(rule.description.trim().length).toBeGreaterThan(20);
  }
});

test("테마 규칙이 대신하는 공통 규칙은 그 테마에서 빠진다", () => {
  const ids = rulesFor(EDITION25_THEME_ID).map((rule) => rule.id);
  expect(ids).not.toContain("C-12");
  expect(ids).toContain("T-E25-04");
  expect(rulesFor("other").map((rule) => rule.id)).toContain("C-12");
});
