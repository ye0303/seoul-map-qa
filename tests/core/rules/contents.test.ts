import { describe, expect, test } from "vitest";

import { findingsOf, row } from "../../helpers.ts";

test("C-11 이름이 비어 있으면 오류", () => {
  expect(findingsOf("C-11", [row({ COT_CONTS_NAME: "  " })])).toMatchObject([{ severity: "error", field: "COT_CONTS_NAME" }]);
});

describe("C-12 대표 이미지 공유", () => {
  const withImages = (...urls: string[]) => urls.map((url, index) => row({ COT_CONTS_ID: `r${index}`, COT_CONTS_NAME: `장소${index}`, COT_IMG_MAIN_URL: url }));

  test("절반 이상이 같은 이미지면 테마 수준 정보 1건", () => {
    expect(findingsOf("C-12", withImages("/a.png", "/a.png", "/a.png", "/b.png"))).toMatchObject([
      { severity: "info", contsId: null, value: "/a.png", message: "4건 중 3건이 같은 대표 이미지를 씁니다." },
    ]);
  });

  test("정확히 절반(4건 중 2건)도 알린다", () => {
    expect(findingsOf("C-12", withImages("/a.png", "/a.png", "/b.png", "/c.png"))).toHaveLength(1);
  });

  test("전체가 같은 이미지(테마 아이콘)거나 절반 미만이면 표시하지 않는다", () => {
    expect(findingsOf("C-12", withImages("/a.png", "/a.png", "/a.png"))).toEqual([]);
    expect(findingsOf("C-12", withImages("/a.png", "/b.png", "/c.png", ""))).toEqual([]);
  });
});
