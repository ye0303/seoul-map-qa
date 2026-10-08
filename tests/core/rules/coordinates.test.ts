import { describe, expect, test } from "vitest";

import { findingsOf, row } from "../../helpers.ts";

describe("C-01 좌표 없음", () => {
  test.each([null, "", "abc"])("COT_COORD_X = %j → 오류", (value) => {
    expect(findingsOf("C-01", [row({ COT_COORD_X: value })])).toMatchObject([{ severity: "error", contsId: "id-1" }]);
  });
});

describe("C-02 위경도 뒤바뀜", () => {
  test("서울공공와이파이 명성경로당: 경도·위도가 바뀐 값", () => {
    const findings = findingsOf("C-02", [row({ COT_COORD_X: 37.574347135, COT_COORD_Y: 127.03191119 })]);
    expect(findings).toMatchObject([{ severity: "error", suggestion: "경도 127.03191119, 위도 37.574347135" }]);
  });
});

describe("C-03 국내 범위 밖", () => {
  test.each([
    ["0, 0", 0, 0],
    ["경도 146.3 (키움센터)", 146.303395187, 36.677228037],
  ])("%s → 오류", (_, lng, lat) => {
    expect(findingsOf("C-03", [row({ COT_COORD_X: lng, COT_COORD_Y: lat })])).toMatchObject([{ severity: "error" }]);
  });
});

describe("C-04 서울 밖 좌표", () => {
  const camp = { COT_COORD_X: 129.002877466, COT_COORD_Y: 36.977708756, COT_GU_NAME: null }; // 봉화 캠핑장

  test("주소는 서울인데 좌표가 서울 밖이면 오류 (난지물재생센터, 약 1km)", () => {
    const findings = findingsOf("C-04", [
      row({ COT_COORD_X: 126.847770316, COT_COORD_Y: 37.58699705, COT_GU_NAME: null, COT_ADDR_FULL_NEW: "", COT_ADDR_FULL_OLD: "서울특별시 경기도 고양시 덕양구-현천동" }),
    ]);
    expect(findings).toMatchObject([{ severity: "error", contsId: "id-1" }]);
    expect(findings[0]!.message).toContain("서울 밖");
  });

  test("구명이 서울 자치구인데 주소 없이 서울 밖이면 오류", () => {
    expect(findingsOf("C-04", [row({ ...camp, COT_GU_NAME: "송파구", COT_ADDR_FULL_NEW: "" })])).toMatchObject([{ severity: "error" }]);
  });

  test("주소·구명 없이 서울 밖이면 의심 (철원 캠핑장)", () => {
    const findings = findingsOf("C-04", [
      row({ COT_COORD_X: 127.39889455, COT_COORD_Y: 38.300951748, COT_GU_NAME: null, COT_ADDR_FULL_NEW: "" }),
    ]);
    expect(findings).toMatchObject([{ severity: "suspect" }]);
  });

  test("주소도 서울 밖인 장소는 행마다 지적하지 않고 테마 수준 정보 1건으로 센다", () => {
    const findings = findingsOf("C-04", [
      row({ ...camp, COT_CONTS_ID: "camp", COT_ADDR_FULL_NEW: "경상북도 봉화군 홍점길 31" }),
      row({ COT_CONTS_ID: "spring", COT_COORD_X: 127.0071351, COT_COORD_Y: 37.4116322, COT_GU_NAME: null, COT_ADDR_FULL_NEW: null, COT_ADDR_FULL_OLD: "경기도 과천시 문원동  산 65" }),
    ]);
    expect(findings).toMatchObject([{ severity: "info", contsId: null, message: "서울 밖 장소가 2건 있습니다(주소도 서울 밖)." }]);
  });

  test("경계 허용 오차(100m) 안이면 표시하지 않는다 (망우리, 약 80m 밖)", () => {
    expect(
      findingsOf("C-04", [row({ COT_COORD_X: 127.112936952, COT_COORD_Y: 37.59102953, COT_GU_NAME: null, COT_ADDR_FULL_NEW: "", COT_ADDR_FULL_OLD: "서울특별시 중랑구 망우동 산 57-3" })]),
    ).toEqual([]);
  });

  test("선·면 콘텐츠는 대표점이라 보지 않는다", () => {
    expect(findingsOf("C-04", [row({ ...camp, COT_COORD_TYPE: "3", COT_ADDR_FULL_NEW: "" })])).toEqual([]);
  });
});
