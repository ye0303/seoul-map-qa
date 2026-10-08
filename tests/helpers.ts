import boundaries from "../reference/seoulDistrictBoundaries.json" with { type: "json" };
import { createDistrictIndex, type DistrictGeoJson } from "../src/core/geo/districtIndex.ts";
import type { ContentRow } from "../src/core/model/row.ts";
import { runRules } from "../src/core/rules/runRules.ts";
import type { Finding } from "../src/core/rules/types.ts";

export const districts = createDistrictIndex(boundaries as DistrictGeoJson);

/** 서울시청(중구) 점 콘텐츠를 기본값으로 둔 행. 필요한 필드만 덮어쓴다. */
export function row(overrides: Record<string, unknown> = {}): ContentRow {
  return {
    COT_CONTS_ID: "id-1",
    COT_CONTS_NAME: "서울시청",
    COT_COORD_X: 126.978462379,
    COT_COORD_Y: 37.566501314,
    COT_COORD_TYPE: "1",
    COT_GU_NAME: "중구",
    COT_ADDR_FULL_NEW: "서울특별시 중구 세종대로 110",
    COT_ADDR_FULL_OLD: "",
    COT_TEL_NO: "",
    COT_THEME_SUB_ID: "1",
    COT_IMG_MAIN_URL: "",
    ...overrides,
  };
}

export function check(rows: readonly ContentRow[], themeId = "test-theme"): Finding[] {
  return runRules({ meta: { id: themeId, name: "테스트" }, rows }, { districts });
}

export function findingsOf(ruleId: string, rows: readonly ContentRow[], themeId?: string): Finding[] {
  return check(rows, themeId).filter((finding) => finding.ruleId === ruleId);
}
