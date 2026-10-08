import { describe, expect, test } from "vitest";

import { SEOUL_DISTRICTS } from "../../../src/core/geo/seoulDistricts.ts";
import type { ContentRow } from "../../../src/core/model/row.ts";
import { EDITION25_THEME_ID } from "../../../src/core/rules/themes/edition25.ts";
import { findingsOf, row } from "../../helpers.ts";

/** 연도마다 25개 구가 한 곳씩 있는 정상 데이터. */
function edition(overrides: Record<string, Record<string, unknown>> = {}): ContentRow[] {
  return ["25", "26"].flatMap((year) =>
    SEOUL_DISTRICTS.map((district, index) => {
      const id = `${year}_edition25_${index + 1}`;
      return row({ COT_CONTS_ID: id, COT_CONTS_NAME: `${district} 명소`, COT_GU_NAME: district, ...overrides[id] });
    }),
  );
}

const of = (ruleId: string, rows: readonly ContentRow[]) => findingsOf(ruleId, rows, EDITION25_THEME_ID);

test("정상 데이터에는 테마 규칙 판정이 없다", () => {
  const rows = edition();
  expect(["T-E25-01", "T-E25-02", "T-E25-03", "T-E25-04"].flatMap((ruleId) => of(ruleId, rows))).toEqual([]);
});

describe("도림천 사례: 관악구 자리(25_edition25_5)에 구명 영등포구", () => {
  const rows = edition({ "25_edition25_5": { COT_CONTS_NAME: "도림천", COT_GU_NAME: "영등포구" } });

  test("T-E25-02 ID의 구 번호와 구명이 달라 관악구를 제안한다", () => {
    expect(of("T-E25-02", rows)).toMatchObject([{ severity: "error", contsId: "25_edition25_5", value: "영등포구", suggestion: "관악구" }]);
  });

  test("T-E25-03 2025년 영등포구가 2곳, 관악구가 0곳", () => {
    expect(of("T-E25-03", rows).map((finding) => [finding.contsId, finding.groupKey, finding.message])).toEqual([
      [null, "25|관악구", "2025년 관악구 장소가 없습니다."],
      ["25_edition25_20", "25|영등포구", "2025년 영등포구 장소가 2곳입니다(구별 1곳): 영등포구 명소, 도림천"],
      ["25_edition25_5", "25|영등포구", "2025년 영등포구 장소가 2곳입니다(구별 1곳): 영등포구 명소, 도림천"],
    ]);
  });
});

test("T-E25-01 ID 형식이 아니면 오류", () => {
  expect(of("T-E25-01", [...edition(), row({ COT_CONTS_ID: "edition25_99" })])).toMatchObject([{ severity: "error", contsId: "edition25_99" }]);
});

describe("T-E25-04 대표 이미지가 다른 장소의 것", () => {
  test("파일명에 다른 콘텐츠 ID가 들어 있으면 의심 (2025년 23곳이 26_edition25_1_2_KOR.jpg)", () => {
    const rows = edition({
      "25_edition25_1": { COT_IMG_MAIN_URL: "/smgis2/file/ucimgs/conts/1786321258890/26_edition25_1_2_KOR.jpg" },
      "25_edition25_2": { COT_IMG_MAIN_URL: "/smgis2/file/ucimgs/conts/1786321258890/25_edition25_2_1_KOR.jpg" },
      "25_edition25_3": { COT_IMG_MAIN_URL: "/smgis2/file/ucimgs/conts/1786321258890/gxpuhtDYXQQFPcdMPrjgpjiWsvPkPoNt.jpg" },
    });
    expect(of("T-E25-04", rows)).toMatchObject([{ severity: "suspect", contsId: "25_edition25_1" }]);
  });

  test("공통 규칙 C-12(대표 이미지 공유)는 이 테마에서 T-E25-04가 대신한다", () => {
    const shared = edition(Object.fromEntries(SEOUL_DISTRICTS.map((_, index) => [`25_edition25_${index + 1}`, { COT_IMG_MAIN_URL: "/x.jpg" }])));
    expect(findingsOf("C-12", shared)).toHaveLength(1);
    expect(of("C-12", shared)).toEqual([]);
  });
});
