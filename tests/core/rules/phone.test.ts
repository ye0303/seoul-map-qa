import { describe, expect, test } from "vitest";

import { checkPhone } from "../../../src/core/rules/common/phone.ts";
import { findingsOf, row } from "../../helpers.ts";

// 값은 모두 2026-10-08 공개 테마에서 실제로 나온 형태다.
describe("정상으로 보는 값", () => {
  test.each([
    "02-3706-1914",
    "02-860-8173",
    "0507-1494-2032",
    "0507-134-8138",
    "1566-6688",
    "02)351-6114",
    "(02) 351-8673",
    "02.516.2513",
    "063 275 9992",
    "0336360601",
    "01072993280",
    "02-2627-2503~4",
    "02-2116-2491∼2503",
    "02-448-3302 FAX : 02-448-6022",
    "02-350-5141 (은평구시설관리공단)",
    "02-431-3535(3206)",
    "관리부서:송파구 푸른도시과 02-2147-3380",
    "02-820-9818,832-2445",
    "02-2258-4300,4100",
    "070-7527-1316 010-7223-8254",
    "02-120",
    "120",
    "-1533-2158",
  ])("%s", (value) => {
    expect(checkPhone(value)).toBeNull();
  });
});

describe("시민 화면에 깨져 보이는 값은 오류", () => {
  test("URL 인코딩 잔재는 풀어 쓴 값을 제안한다", () => {
    expect(checkPhone("02-350-5233%7E5244")).toEqual({ severity: "error", reason: "URL 인코딩된 문자(%XX)가 섞여 있습니다", suggestion: "02-350-5233~5244" });
    expect(checkPhone("02%29+364-4686")).toMatchObject({ severity: "error", suggestion: "02) 364-4686" });
  });

  test.each([
    ["링크", "http://db.history.go.kr/item/l"],
    ["암호화 값", "En-cry-pted"],
    ["'null' 문자열", "null"],
    ["HTML 특수문자", "%26nbsp%3B010-4423-9880"],
    ["깨진 글자", `053${String.fromCharCode(0xfffd)}642${String.fromCharCode(0xfffd)}8078`],
  ])("%s", (_, value) => {
    expect(checkPhone(value)).toMatchObject({ severity: "error" });
  });
});

describe("틀렸을 가능성이 큰 번호는 의심", () => {
  test.each([
    ["28159575", "지역번호가 없습니다"],
    ["944-4153", "지역번호가 없습니다"],
    ["02-582-333", "자릿수가 맞지 않습니다"],
    ["010-7373", "자릿수가 맞지 않습니다"],
    ["1", "자릿수가 맞지 않습니다"],
    ["070-4224-192", "끝자리가 4자리가 아닙니다"],
    ["02-3999-219", "끝자리가 4자리가 아닙니다"],
    ["문의 바람", "번호가 없습니다"],
  ])("%s → %s", (value, reason) => {
    expect(checkPhone(value)).toEqual({ severity: "suspect", reason });
  });

  test("앞자리 0이 빠진 번호는 0을 붙인 번호를 제안한다 (엑셀 숫자 변환 흔적)", () => {
    expect(checkPhone("269563233")).toEqual({ severity: "suspect", reason: "앞자리 0이 빠진 것 같습니다", suggestion: "02-6956-3233" });
  });
});

test.each(["-", ".", "없음", "업체미제공"])("'%s' 같은 없음 표시는 정보", (value) => {
  expect(checkPhone(value)).toMatchObject({ severity: "info" });
});

test("C-10 규칙은 COT_TEL_NO를 판정해 값·제안값과 함께 알린다", () => {
  expect(findingsOf("C-10", [row({ COT_TEL_NO: "02-350-5233%7E5244" })])).toMatchObject([
    { severity: "error", field: "COT_TEL_NO", value: "02-350-5233%7E5244", suggestion: "02-350-5233~5244" },
  ]);
  expect(findingsOf("C-10", [row({ COT_TEL_NO: "02-3706-1914" }), row({ COT_CONTS_ID: "b", COT_TEL_NO: null })])).toEqual([]);
});
