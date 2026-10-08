import { describe, expect, test } from "vitest";

import boundaries from "../../../reference/seoulDistrictBoundaries.json" with { type: "json" };
import { createDistrictIndex, type DistrictGeoJson } from "../../../src/core/geo/districtIndex.ts";
import { SEOUL_DISTRICTS } from "../../../src/core/geo/seoulDistricts.ts";

const index = createDistrictIndex(boundaries as DistrictGeoJson);

describe("districtAt", () => {
  test.each([
    ["서울시청", 126.978462379, 37.566501314, "중구"],
    ["국회의사당", 126.9144, 37.5318, "영등포구"],
    ["코엑스", 127.059, 37.5116, "강남구"],
    ["관악산(서울에디션25)", 126.963660055, 37.44509452, "관악구"],
    ["도림천(서울에디션25 등록 좌표)", 126.88587, 37.51375, "영등포구"],
  ])("%s → %s", (_, lng, lat, expected) => {
    expect(index.districtAt(lng, lat)).toBe(expected);
  });

  test("서울 밖이면 null", () => {
    expect(index.districtAt(126.523346102, 33.504208958)).toBeNull(); // 제주
    expect(index.districtAt(127.0071351, 37.4116322)).toBeNull(); // 과천
  });

  test("경계 파일의 이름은 서울 25개 자치구와 같다", () => {
    expect(boundaries.features.map((feature) => feature.properties.name).sort()).toEqual([...SEOUL_DISTRICTS].sort());
  });
});

describe("distanceToDistrictM", () => {
  test("안에 있으면 0, 모르는 이름이면 Infinity", () => {
    expect(index.distanceToDistrictM("중구", 126.978462379, 37.566501314)).toBe(0);
    expect(index.distanceToDistrictM("과천시", 126.978462379, 37.566501314)).toBe(Infinity);
  });

  test("다른 구에 있는 점은 그 구까지의 거리", () => {
    // 관악구 보건소 좌표. 구로구 동쪽 끝(경도 126.9032)까지 경도 차이만 약 4.27km
    const distance = index.distanceToDistrictM("구로구", 126.951206, 37.4785635);
    expect(distance).toBeGreaterThan(4270);
    expect(distance).toBeLessThan(4500);
  });
});

describe("distanceToSeoulM", () => {
  test("서울 안이면 0", () => {
    expect(index.distanceToSeoulM(126.978462379, 37.566501314)).toBe(0);
  });

  test("서울 밖이면 서울 외곽선까지의 거리", () => {
    // 난지물재생센터(고양시) 등록 좌표: 서울에서 약 1km
    const distance = index.distanceToSeoulM(126.847770316, 37.58699705);
    expect(distance).toBeGreaterThan(800);
    expect(distance).toBeLessThan(1100);
  });
});
