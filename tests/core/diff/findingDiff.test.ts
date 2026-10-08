import { describe, expect, test } from "vitest";

import edition25 from "../../fixtures/edition25.json" with { type: "json" };
import mineralSprings from "../../fixtures/mineral-springs.json" with { type: "json" };
import nightViews from "../../fixtures/night-views.json" with { type: "json" };
import { diffFindings, splitFindingChanges } from "../../../src/core/diff/findingDiff.ts";
import type { Finding } from "../../../src/core/rules/types.ts";
import { check, row } from "../../helpers.ts";

const finding = (fingerprint: string, severity: Finding["severity"] = "error"): Finding => ({
  ruleId: fingerprint.split("|")[0]!,
  severity,
  contsId: fingerprint,
  message: fingerprint,
  fingerprint,
});

describe("diffFindings", () => {
  test("지문으로 신규·해결·등급 변화·그대로를 나눈다", () => {
    const before = [finding("C-05|t|a"), finding("C-10|t|b", "suspect"), finding("C-08|t|c", "suspect")];
    const after = [finding("C-05|t|a"), finding("C-10|t|b", "error"), finding("C-11|t|d")];
    const diff = diffFindings(before, after);
    expect(diff.added.map((item) => item.fingerprint)).toEqual(["C-11|t|d"]);
    expect(diff.resolved.map((item) => item.fingerprint)).toEqual(["C-08|t|c"]);
    expect(diff.severityChanged.map(({ before: from, after: to }) => [from.severity, to.severity])).toEqual([["suspect", "error"]]);
    expect(diff.unchanged).toBe(1);
  });

  test("틀린 값이 다른 틀린 값으로 바뀌면 신규·해결이 아니라 그대로다", () => {
    const before = check([row({ COT_TEL_NO: "28159575" })]);
    const after = check([row({ COT_TEL_NO: "944-4153" })]);
    expect(diffFindings(before, after)).toMatchObject({ added: [], resolved: [], severityChanged: [], unchanged: 1 });
  });

  test("실제 테마의 판정 지문은 테마 안에서 겹치지 않는다", () => {
    for (const fixture of [edition25, mineralSprings, nightViews]) {
      const fingerprints = check(fixture.rows, fixture.meta.id).map((item) => item.fingerprint);
      expect(new Set(fingerprints).size).toBe(fingerprints.length);
    }
  });
});

describe("splitFindingChanges", () => {
  const previous = { rulesetVersion: 1, findings: [finding("C-05|t|a"), finding("C-10|t|b")] };

  test("규칙 버전이 같으면 모두 데이터 변화다", () => {
    const result = splitFindingChanges(previous, { rulesetVersion: 1, findings: [finding("C-05|t|a")] }, () => {
      throw new Error("다시 검사하지 않는다");
    });
    expect(result.rules).toBeNull();
    expect(result.data.resolved.map((item) => item.fingerprint)).toEqual(["C-10|t|b"]);
  });

  test("규칙 버전이 다르면 직전 데이터를 다시 검사해 규칙 영향과 데이터 변화를 나눈다", () => {
    // 새 규칙은 C-10|t|b를 더는 내지 않고 C-12|t|x를 새로 낸다(규칙 영향). 데이터에서는 C-05|t|a가 고쳐졌다(데이터 변화).
    const rechecked = [finding("C-05|t|a"), finding("C-12|t|x")];
    const result = splitFindingChanges(previous, { rulesetVersion: 2, findings: [finding("C-12|t|x")] }, () => rechecked);
    expect(result.rules?.added.map((item) => item.fingerprint)).toEqual(["C-12|t|x"]);
    expect(result.rules?.resolved.map((item) => item.fingerprint)).toEqual(["C-10|t|b"]);
    expect(result.data.added).toEqual([]);
    expect(result.data.resolved.map((item) => item.fingerprint)).toEqual(["C-05|t|a"]);
  });
});
