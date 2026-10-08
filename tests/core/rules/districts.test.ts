import { describe, expect, test } from "vitest";

import { findingsOf, row } from "../../helpers.ts";

describe("C-05 구명과 좌표의 구 불일치", () => {
  test("좌표·주소가 같은 구를 가리키고 구명만 멀리 다르면 오류 (관악구 보건소에 구명 구로구)", () => {
    const findings = findingsOf("C-05", [
      row({ COT_COORD_X: 126.951206, COT_COORD_Y: 37.4785635, COT_GU_NAME: "구로구", COT_ADDR_FULL_NEW: "서울특별시 관악구 관악로 145" }),
    ]);
    expect(findings).toMatchObject([{ severity: "error", field: "COT_GU_NAME", value: "구로구", suggestion: "관악구" }]);
  });

  test("이름이 다른 장소들이 한 좌표를 함께 쓰면 좌표·주소를 의심하고 구명 수정을 제안하지 않는다 (종로구 약수터들이 용산구 대표 좌표에)", () => {
    const placeholder = { COT_COORD_X: 126.9695533, COT_COORD_Y: 37.5224957, COT_GU_NAME: "종로구", COT_ADDR_FULL_NEW: "서울특별시 용산구 이촌로 181" };
    const findings = findingsOf("C-05", [
      row({ ...placeholder, COT_CONTS_ID: "wm_0017", COT_CONTS_NAME: "인왕산" }),
      row({ ...placeholder, COT_CONTS_ID: "wm_0020", COT_CONTS_NAME: "백사실" }),
    ]);
    expect(findings).toHaveLength(2);
    for (const finding of findings) {
      expect(finding).toMatchObject({ severity: "suspect", value: "종로구" });
      expect(finding).not.toHaveProperty("suggestion");
      expect(finding.message).toContain("이름이 다른 장소 1곳이 함께");
    }
  });

  test("구 경계 근처면 의심 (천호역: 구명 강동구, 좌표·주소 송파구)", () => {
    const findings = findingsOf("C-05", [
      row({ COT_COORD_X: 127.122905, COT_COORD_Y: 37.538462, COT_GU_NAME: "강동구", COT_ADDR_FULL_NEW: "서울특별시 송파구 올림픽로 633" }),
    ]);
    expect(findings).toMatchObject([{ severity: "suspect", suggestion: "송파구" }]);
  });

  test("주소가 구명과 같고 좌표가 경계 오차 안이면 표시하지 않는다 (강동구청역)", () => {
    expect(
      findingsOf("C-05", [
        row({ COT_COORD_X: 127.120576044, COT_COORD_Y: 37.530674132, COT_GU_NAME: "강동구", COT_ADDR_FULL_NEW: "서울특별시 강동구 올림픽로 550", COT_ADDR_FULL_OLD: "서울특별시 송파구 풍납동 490-16" }),
      ]),
    ).toEqual([]);
  });

  test("주소가 구명과 같은데 좌표가 멀리 다른 구면 좌표를 의심한다", () => {
    const findings = findingsOf("C-05", [row({ COT_COORD_X: 127.059, COT_COORD_Y: 37.5116 })]); // 구명·주소 중구, 좌표 코엑스(강남구)
    expect(findings).toMatchObject([{ severity: "suspect", value: "중구" }]);
    expect(findings[0]).not.toHaveProperty("suggestion");
    expect(findings[0]!.message).toContain("좌표가 틀렸을 수 있습니다");
  });

  test("구명이 서울 자치구가 아닌데 좌표가 서울 안이면 의심", () => {
    expect(findingsOf("C-05", [row({ COT_GU_NAME: "과천시" })])).toMatchObject([{ severity: "suspect", suggestion: "중구" }]);
  });

  test("시도 없는 '중구 …' 주소도 좌표가 서울 안이면 서울 주소로 쓴다 (국립극장)", () => {
    const findings = findingsOf("C-05", [
      row({ COT_COORD_X: 126.9996846, COT_COORD_Y: 37.5526403, COT_GU_NAME: "용산구", COT_ADDR_FULL_NEW: "", COT_ADDR_FULL_OLD: "중구 장충동2가 14-67" }),
    ]);
    expect(findings).toMatchObject([{ severity: "error", suggestion: "중구" }]);
  });

  test.each(["", " ", "1"])("좌표 타입 %j은 점으로 보고 판정한다", (type) => {
    expect(findingsOf("C-05", [row({ COT_COORD_TYPE: type, COT_COORD_X: 127.059, COT_COORD_Y: 37.5116 })])).toHaveLength(1);
  });

  test.each(["2", "3", "4", "5", "6", "7", "8"])("좌표 타입 %s(점이 아님)는 구 판정을 하지 않는다", (type) => {
    expect(findingsOf("C-05", [row({ COT_COORD_TYPE: type, COT_COORD_X: 127.059, COT_COORD_Y: 37.5116 })])).toEqual([]);
  });

  test("구명과 좌표의 구가 같으면 표시하지 않는다", () => {
    expect(findingsOf("C-05", [row()])).toEqual([]);
  });
});

describe("C-06 구명과 주소의 구 불일치", () => {
  test("구명·좌표는 같은데 주소만 멀리 다른 구면 주소를 의심한다 (아띠어린이집: 동작구 좌표에 송파구 주소)", () => {
    const findings = findingsOf("C-06", [
      row({ COT_COORD_X: 126.94361, COT_COORD_Y: 37.49699, COT_GU_NAME: "동작구", COT_ADDR_FULL_NEW: "서울특별시 송파구 성내천로 103" }),
    ]);
    expect(findings).toMatchObject([{ severity: "suspect", field: "COT_ADDR_FULL_NEW", value: "송파구" }]);
  });

  test("주소의 구가 경계 오차 안이면 표시하지 않는다 (사당역: 관악구 좌표, 동작구 주소)", () => {
    expect(
      findingsOf("C-06", [
        row({ COT_COORD_X: 126.981389612, COT_COORD_Y: 37.476518911, COT_GU_NAME: "관악구", COT_ADDR_FULL_NEW: "서울특별시 동작구 남부순환로 2089" }),
      ]),
    ).toEqual([]);
  });

  test("좌표가 주소 쪽이면 C-05가 잡으므로 표시하지 않는다", () => {
    expect(
      findingsOf("C-06", [row({ COT_COORD_X: 126.951206, COT_COORD_Y: 37.4785635, COT_GU_NAME: "구로구", COT_ADDR_FULL_NEW: "서울특별시 관악구 관악로 145" })]),
    ).toEqual([]);
  });

  test("좌표로 구를 판정할 수 없으면(선 콘텐츠) 구명과 주소가 다르다고만 알린다", () => {
    const findings = findingsOf("C-06", [row({ COT_COORD_TYPE: "3", COT_ADDR_FULL_NEW: "서울특별시 서대문구 통일로 251" })]);
    expect(findings).toMatchObject([{ severity: "suspect", field: "COT_GU_NAME", value: "중구" }]);
  });

  test("새 주소를 읽을 수 없으면 옛 주소를 본다", () => {
    const findings = findingsOf("C-06", [
      row({ COT_COORD_X: 126.94361, COT_COORD_Y: 37.49699, COT_GU_NAME: "동작구", COT_ADDR_FULL_NEW: null, COT_ADDR_FULL_OLD: "서울특별시 송파구 오금동 135" }),
    ]);
    expect(findings).toMatchObject([{ field: "COT_ADDR_FULL_OLD" }]);
  });
});

describe("C-07 구명 비어 있음", () => {
  test("일부만 비어 있으면 행마다 알리고 좌표의 구를 제안한다", () => {
    const rows = [row({ COT_CONTS_ID: "a", COT_GU_NAME: null }), row({ COT_CONTS_ID: "b" })];
    expect(findingsOf("C-07", rows)).toMatchObject([{ severity: "info", contsId: "a", suggestion: "중구" }]);
  });

  test("90% 이상 비어 있으면 테마 수준 1건으로 묶는다", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row({ COT_CONTS_ID: `r${index}`, COT_GU_NAME: index === 0 ? "중구" : "" }));
    expect(findingsOf("C-07", rows)).toMatchObject([{ severity: "info", contsId: null, message: "구명이 10건 중 9건 비어 있습니다." }]);
  });
});
