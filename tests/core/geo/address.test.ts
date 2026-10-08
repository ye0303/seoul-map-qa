import { expect, test } from "vitest";

import { parseAddress } from "../../../src/core/geo/address.ts";

test.each([
  ["서울특별시 중구 세종대로 110", { inSeoul: true, gu: "중구" }],
  ["서울특별시 중랑구 망우동 산 57-3", { inSeoul: true, gu: "중랑구" }],
  ["서울시 구로구 오리로 1189", { inSeoul: true, gu: "구로구" }],
  ["서울 강남구 봉은사로 531", { inSeoul: true, gu: "강남구" }],
  ["서울특별시중구 을지로 66", { inSeoul: true, gu: "중구" }],
  ["  서울특별시   동대문구 천호대로4길 21", { inSeoul: true, gu: "동대문구" }],
  ["양천구 신정동 11", { inSeoul: true, gu: "양천구" }],
  ["중구 장충동2가 14-67", { inSeoul: true, gu: "중구", ambiguous: true }],
  ["강서구 방화동 163-8", { inSeoul: true, gu: "강서구", ambiguous: true }],
  ["서울특별시 강서구 마곡동로 161", { inSeoul: true, gu: "강서구" }],
  ["서울특별시", { inSeoul: true, gu: null }],
  ["경기도 과천시 문원동 산 65", { inSeoul: false, gu: null }],
  ["제주특별자치도 제주시 전농로 96", { inSeoul: false, gu: null }],
  ["경상북도 봉화군 홍점길 31", { inSeoul: false, gu: null }],
  ["인천광역시 중구 공항로 272", { inSeoul: false, gu: null }],
  ["", { inSeoul: null, gu: null }],
  ["서울대입구역 앞", { inSeoul: null, gu: null }],
  ["중구청로 1", { inSeoul: null, gu: null }],
])("%s", (address, expected) => {
  expect(parseAddress(address)).toEqual(expected);
});
