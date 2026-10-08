import { describe, expect, test } from "vitest";

import { findingsOf, row } from "../../helpers.ts";

describe("C-08 중복 등록 의심", () => {
  test("ID·등록일만 다르고 내용이 같으면 두 행 모두 알린다", () => {
    const findings = findingsOf("C-08", [
      row({ COT_CONTS_ID: "b", COT_REG_DATE: "2026-01-02" }),
      row({ COT_CONTS_ID: "a", COT_REG_DATE: "2026-01-01" }),
    ]);
    const same = findings.filter((finding) => finding.groupKey === "same:a");
    expect(same.map((finding) => finding.contsId)).toEqual(["a", "b"]);
    expect(same[0]!.message).toBe("ID만 다르고 내용이 같은 행이 2건 있습니다: a, b");
  });

  test("같은 좌표·같은 분류에 이름이 한 글자만 다른 행 (문찬구/문찬수 압구정성모내과의원)", () => {
    const findings = findingsOf("C-08", [
      row({ COT_CONTS_ID: "a", COT_CONTS_NAME: "문찬구압구정성모내과의원", COT_TEL_NO: "02-1" }),
      row({ COT_CONTS_ID: "b", COT_CONTS_NAME: "문찬수압구정성모내과의원", COT_TEL_NO: "02-2" }),
    ]);
    expect(findings).toMatchObject([
      { severity: "suspect", contsId: "a", groupKey: "coord:a" },
      { severity: "suspect", contsId: "b", groupKey: "coord:a" },
    ]);
  });

  test("이름의 띄어쓰기·괄호만 달라도 같은 이름으로 본다", () => {
    const findings = findingsOf("C-08", [
      row({ COT_CONTS_ID: "a", COT_CONTS_NAME: "(주)에스엔유통 고대종암점", COT_TEL_NO: "1" }),
      row({ COT_CONTS_ID: "b", COT_CONTS_NAME: "(주)에스엔유통고대종암점", COT_TEL_NO: "2" }),
    ]);
    expect(findings).toHaveLength(2);
  });

  test("분류(서브카테고리)가 다르면 한 장소를 여러 분류에 올린 것이라 제외한다", () => {
    expect(
      findingsOf("C-08", [row({ COT_CONTS_ID: "a", COT_THEME_SUB_ID: "1" }), row({ COT_CONTS_ID: "b", COT_THEME_SUB_ID: "2" })]),
    ).toEqual([]);
  });

  test("같은 건물의 다른 층·동(16동 1층/2층)은 제외한다", () => {
    expect(
      findingsOf("C-08", [row({ COT_CONTS_ID: "a", COT_CONTS_NAME: "16동 1층" }), row({ COT_CONTS_ID: "b", COT_CONTS_NAME: "16동 2층" })]),
    ).toEqual([]);
  });

  test("(좌)/(우)처럼 지점 표기만 다르면 제외한다 (장미동산 약수터)", () => {
    expect(
      findingsOf("C-08", [row({ COT_CONTS_ID: "a", COT_CONTS_NAME: "장미동산(좌)" }), row({ COT_CONTS_ID: "b", COT_CONTS_NAME: "장미동산(우)" })]),
    ).toEqual([]);
  });

  test("이름 유사도 0.8이 경계: 10글자 중 2글자 차이는 같은 장소, 3글자 차이는 다른 장소", () => {
    const pair = (other: string) =>
      findingsOf("C-08", [row({ COT_CONTS_ID: "a", COT_CONTS_NAME: "가나다라마바사아자차", COT_TEL_NO: "1" }), row({ COT_CONTS_ID: "b", COT_CONTS_NAME: other, COT_TEL_NO: "2" })]);
    expect(pair("가나다라마바사아카타")).toHaveLength(2);
    expect(pair("가나다라마바사파카타")).toEqual([]);
  });

  test("한 좌표에 이름이 50개보다 많으면(행사장 등) 비슷한 이름은 건너뛰고 같은 이름만 묶는다", () => {
    const crowd = Array.from({ length: 51 }, (_, index) => row({ COT_CONTS_ID: `e${index}`, COT_CONTS_NAME: `행사 ${index}회차 안내`, COT_TEL_NO: String(index) }));
    const findings = findingsOf("C-08", [
      ...crowd,
      row({ COT_CONTS_ID: "x1", COT_CONTS_NAME: "문찬구압구정성모내과의원", COT_TEL_NO: "x1" }),
      row({ COT_CONTS_ID: "x2", COT_CONTS_NAME: "문찬수압구정성모내과의원", COT_TEL_NO: "x2" }),
      row({ COT_CONTS_ID: "y1", COT_CONTS_NAME: "같은 이름", COT_TEL_NO: "y1" }),
      row({ COT_CONTS_ID: "y2", COT_CONTS_NAME: "같은 이름", COT_TEL_NO: "y2" }),
    ]);
    expect(findings.map((finding) => finding.contsId)).toEqual(["y1", "y2"]);
  });

  test("같은 좌표라도 이름이 전혀 다르면(같은 건물의 다른 가게) 제외한다", () => {
    expect(
      findingsOf("C-08", [row({ COT_CONTS_ID: "a", COT_CONTS_NAME: "가까운주점" }), row({ COT_CONTS_ID: "b", COT_CONTS_NAME: "부산진오뎅바" })]),
    ).toEqual([]);
  });
});

describe("C-09 가까운 곳에 같은 이름", () => {
  const healing = (id: string, lng: number, lat: number, sub = "18") =>
    row({ COT_CONTS_ID: id, COT_CONTS_NAME: "경춘선 힐링쉼터", COT_COORD_X: lng, COT_COORD_Y: lat, COT_GU_NAME: "노원구", COT_ADDR_FULL_NEW: "서울특별시 노원구 공릉로51길 20", COT_THEME_SUB_ID: sub });

  test("30m 안의 같은 이름·같은 분류 (경춘선 힐링쉼터, 약 6m)", () => {
    const findings = findingsOf("C-09", [healing("100362_1719386904078", 127.075707892, 37.628373879), healing("gyeongchun18010", 127.075724571, 37.628430263)]);
    expect(findings.map((finding) => [finding.severity, finding.contsId])).toEqual([
      ["suspect", "100362_1719386904078"],
      ["suspect", "gyeongchun18010"],
    ]);
  });

  test("30m보다 멀거나 분류가 다르면 제외한다", () => {
    expect(findingsOf("C-09", [healing("a", 127.0757, 37.6283), healing("b", 127.0757, 37.6290)])).toEqual([]);
    expect(findingsOf("C-09", [healing("a", 127.075707892, 37.628373879), healing("b", 127.075724571, 37.628430263, "19")])).toEqual([]);
  });

  test("테마 안에서 4번까지 나오는 이름은 고유 이름으로 본다", () => {
    const rows = [healing("a", 127.075707892, 37.628373879), healing("b", 127.075724571, 37.628430263), healing("c", 127.08, 37.63), healing("d", 127.09, 37.64)];
    expect(findingsOf("C-09", rows).map((finding) => finding.contsId)).toEqual(["a", "b"]);
  });

  test("테마 안에서 5번 이상 나오는 이름(분류명)은 보지 않는다", () => {
    const rows = Array.from({ length: 5 }, (_, index) => healing(`r${index}`, 127.0757 + index * 0.00005, 37.6284));
    expect(findingsOf("C-09", rows)).toEqual([]);
  });
});

describe("C-15 콘텐츠 ID 중복", () => {
  test("같은 ID는 입력 순서와 관계없이 내용순으로 ID#1, ID#2가 붙는다", () => {
    const x = row({ COT_CONTS_ID: "dup", COT_CONTS_NAME: "가" });
    const y = row({ COT_CONTS_ID: "dup", COT_CONTS_NAME: "나" });
    const forward = findingsOf("C-15", [x, y]);
    expect(forward).toMatchObject([
      { severity: "error", contsId: "dup#1" },
      { severity: "error", contsId: "dup#2" },
    ]);
    expect(findingsOf("C-15", [y, x])).toEqual(forward);
  });
});
