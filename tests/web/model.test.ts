import { describe, expect, test } from "vitest";

import { normalizeRows } from "../../src/core/model/snapshot.ts";
import { compareVersions, createRowReader, rowNames } from "../../src/web/model/compare.ts";
import { countByRule, filterFindings, NO_FILTER, ruleTitle } from "../../src/web/model/findings.ts";
import { displayValue, koreanDateTime, rowChangeText, tagLabel, timeAgo } from "../../src/web/model/format.ts";
import { searchThemes, summarizeDepartments, uncheckedThemes, UNKNOWN_DEPARTMENT } from "../../src/web/model/summary.ts";
import { href, parseRoute } from "../../src/web/route.ts";
import { finding, theme } from "./fixtures.ts";

describe("담당 과 요약", () => {
  const themes = [
    theme("a", { department: { label: "서울시 관광정책과", codes: ["1", "", "관광정책과"] }, counts: { error: 1, suspect: 9, info: 0 } }),
    theme("b", { department: { label: "성북구 기획예산과", codes: ["2", "성북구", "기획예산과"] }, counts: { error: 5, suspect: 0, info: 1 } }),
    theme("c", {
      department: { label: "서울시 관광정책과", codes: ["1", "", "관광정책과"] },
      counts: { error: 2, suspect: 1, info: 0 },
      change: { since: "2026-10-08T14:58", rows: null, findings: { added: 4, resolved: 2, severityChanged: 0 } },
    }),
    theme("d", { department: null, status: "unavailable", counts: null, rowCount: null, lastSuccessAt: null, change: undefined }),
  ];

  test("과별로 합치고 오류 많은 과부터, 담당 미상은 맨 뒤", () => {
    const summary = summarizeDepartments(themes);
    expect(summary.map((department) => department.name)).toEqual(["성북구 기획예산과", "서울시 관광정책과", UNKNOWN_DEPARTMENT]);
    expect(summary[1]).toMatchObject({ themes: 2, checked: 2, counts: { error: 3, suspect: 10, info: 0 }, added: 4, resolved: 2 });
    expect(summary[2]).toMatchObject({ themes: 1, checked: 0, counts: { error: 0, suspect: 0, info: 0 } });
  });

  test("검사하지 못한 테마와 이름·과 검색", () => {
    expect(uncheckedThemes(themes).map((entry) => entry.id)).toEqual(["d"]);
    expect(searchThemes(themes, "관광 정책").map((entry) => entry.id)).toEqual(["c", "a"]);
    expect(searchThemes(themes, "테마 b").map((entry) => entry.id)).toEqual(["b"]);
    expect(searchThemes(themes, "  ")).toEqual([]);
  });
});

describe("표시 형식", () => {
  test("한국 시각, 태그, 경과 시간", () => {
    expect(koreanDateTime("2026-10-08T07:56:47.143Z")).toBe("2026-10-08 16:56");
    expect(tagLabel("snap-2026-10-08-1458")).toBe("2026-10-08 14:58");
    expect(tagLabel("v1")).toBe("v1");
    const now = new Date("2026-10-08T10:00:00Z");
    expect(timeAgo("2026-10-08T09:59:30Z", now)).toBe("방금");
    expect(timeAgo("2026-10-08T09:15:00Z", now)).toBe("45분 전");
    expect(timeAgo("2026-10-08T05:00:00Z", now)).toBe("5시간 전");
    expect(timeAgo("2026-10-05T10:00:00Z", now)).toBe("3일 전");
  });

  test("값과 행 변화", () => {
    expect(displayValue(null)).toBe("(비어 있음)");
    expect(displayValue(undefined)).toBe("(열 없음)");
    expect(displayValue([1, 2])).toBe("[1,2]");
    expect(displayValue(37.5)).toBe("37.5");
    expect(rowChangeText({ added: 1, removed: 0, modified: 1200 })).toBe("추가 1 · 삭제 0 · 변경 1,200");
    expect(rowChangeText({ added: 0, removed: 0, modified: 0, datesOnly: 3 })).toBe("추가 0 · 삭제 0 · 변경 0 · 수정일만 바뀜 3");
  });
});

describe("해시 주소", () => {
  test("주소를 화면으로, 화면을 주소로", () => {
    expect(parseRoute("")).toEqual({ page: "home" });
    expect(parseRoute("#/")).toEqual({ page: "home" });
    expect(parseRoute("#/rules")).toEqual({ page: "rules" });
    expect(parseRoute(href.department("서울시 문화본부 문화정책과"))).toEqual({ page: "department", department: "서울시 문화본부 문화정책과" });
    expect(parseRoute(href.theme("1786321258890"))).toEqual({ page: "theme", themeId: "1786321258890", tab: "findings" });
    expect(parseRoute(href.theme("1786321258890", "versions"))).toEqual({ page: "theme", themeId: "1786321258890", tab: "versions" });
    expect(parseRoute(href.diff("11102828", "snap-2026-10-08-1458", "snap-2026-10-08-1654"))).toEqual({
      page: "diff",
      themeId: "11102828",
      from: "snap-2026-10-08-1458",
      to: "snap-2026-10-08-1654",
    });
    expect(parseRoute("#/theme/1/unknown")).toEqual({ page: "notFound" });
    expect(parseRoute("#/dept/a%2Fb")).toEqual({ page: "department", department: "a/b" });
    expect(parseRoute("#/dept/%E0%A4%A")).toEqual({ page: "notFound" });
  });
});

describe("판정 거르기", () => {
  const findings = [
    finding("C-10", "1", { severity: "suspect", name: "북한산 공원", value: "02-123" }),
    finding("C-05", "2", { name: "도림천" }),
    finding("C-05", "3", { severity: "info", name: "강변서재" }),
    finding("T-E25-03", null, { groupKey: "25|관악구" }),
  ];

  test("등급 순으로 정렬하고 등급·규칙·검색·신규로 거른다", () => {
    expect(filterFindings(findings, NO_FILTER, null).map((item) => item.contsId)).toEqual(["2", null, "1", "3"]);
    expect(filterFindings(findings, { ...NO_FILTER, severity: "suspect" }, null)).toHaveLength(1);
    expect(filterFindings(findings, { ...NO_FILTER, ruleId: "C-05" }, null).map((item) => item.contsId)).toEqual(["2", "3"]);
    expect(filterFindings(findings, { ...NO_FILTER, query: "도림 천" }, null).map((item) => item.contsId)).toEqual(["2"]);
    expect(filterFindings(findings, { ...NO_FILTER, query: "02-123" }, null).map((item) => item.contsId)).toEqual(["1"]);
    const added = new Set([findings[2]!.fingerprint]);
    expect(filterFindings(findings, { ...NO_FILTER, onlyNew: true }, added).map((item) => item.contsId)).toEqual(["3"]);
    expect(filterFindings(findings, { ...NO_FILTER, onlyNew: true }, null)).toEqual([]);
  });

  test("규칙별 수는 규칙 번호순, 이름은 등록부에서", () => {
    const many = [finding("C-10", "1"), finding("C-05", "2"), finding("C-05", "3"), finding("C-15", "4"), finding("T-E25-01", "5")];
    expect(countByRule(many)).toEqual([
      { ruleId: "C-05", count: 2 },
      { ruleId: "C-10", count: 1 },
      { ruleId: "C-15", count: 1 },
      { ruleId: "T-E25-01", count: 1 },
    ]);
    expect(ruleTitle("C-05")).toBe("구명과 좌표의 구 불일치");
    expect(ruleTitle("X-99")).toBe("X-99");
  });
});

describe("버전 비교", () => {
  const before = normalizeRows([
    { COT_CONTS_ID: "1", COT_CONTS_NAME: "가", COT_GU_NAME: "중구", COT_UPDATE_DATE: "2026-10-01" },
    { COT_CONTS_ID: "2", COT_CONTS_NAME: "나", COT_GU_NAME: "종로구", COT_UPDATE_DATE: "2026-10-01" },
    { COT_CONTS_ID: "3", COT_CONTS_NAME: "다", COT_GU_NAME: "용산구", COT_UPDATE_DATE: "2026-10-01" },
  ]);
  const after = normalizeRows([
    { COT_CONTS_ID: "1", COT_CONTS_NAME: "가", COT_GU_NAME: "중구", COT_UPDATE_DATE: "2026-10-08" },
    { COT_CONTS_ID: "2", COT_CONTS_NAME: "나", COT_GU_NAME: "성동구", COT_UPDATE_DATE: "2026-10-08" },
    { COT_CONTS_ID: "4", COT_CONTS_NAME: "", COT_GU_NAME: "마포구", COT_UPDATE_DATE: "2026-10-08" },
  ]);

  test("추가·삭제·변경을 이름·한글 항목과 함께, 수정일만 바뀐 행은 따로", () => {
    const resolved = finding("C-05", "2");
    const comparison = compareVersions({ snapshot: before, findings: [resolved] }, { snapshot: after, findings: [finding("C-07", "4")] });
    expect(comparison.added).toEqual([{ key: "4", name: null }]);
    expect(comparison.removed).toEqual([{ key: "3", name: "다" }]);
    expect(comparison.modified).toEqual([{ key: "2", name: "나", fields: [{ column: "COT_GU_NAME", label: "구명", before: "종로구", after: "성동구" }] }]);
    expect(comparison.timestampOnly).toEqual([{ key: "1", name: "가" }]);
    expect(comparison.findings.added.map((item) => item.ruleId)).toEqual(["C-07"]);
    expect(comparison.findings.resolved).toEqual([resolved]);
  });

  test("판정의 행 키(같은 ID는 ID#순번)로 원본 행을 꺼낸다", () => {
    // 같은 ID의 행은 행 서명순(이름 "둘째" < "첫째")으로 #1, #2가 붙는다.
    const snapshot = normalizeRows([
      { COT_CONTS_ID: "7", COT_CONTS_NAME: "첫째", COT_TEL_NO: "02-1" },
      { COT_CONTS_ID: "7", COT_CONTS_NAME: "둘째", COT_TEL_NO: "02-2" },
    ]);
    const read = createRowReader(snapshot);
    expect(read("7")).toBeNull();
    expect(read("7#1")?.find((field) => field.column === "COT_TEL_NO")).toEqual({ column: "COT_TEL_NO", label: "전화번호", value: "02-2" });
    expect(rowNames(snapshot)).toEqual(new Map([["7#1", "둘째"], ["7#2", "첫째"]]));
  });
});
