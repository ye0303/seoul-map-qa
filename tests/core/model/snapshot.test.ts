import { describe, expect, test } from "vitest";

import { contentHash, normalizeRows } from "../../../src/core/model/snapshot.ts";

const a = { COT_CONTS_ID: "b", COT_CONTS_NAME: "둘", COT_TEL_NO: "", DIST: 0.5, RNUM: 1 };
const b = { COT_CONTS_ID: "a", COT_CONTS_NAME: "하나", COT_TEL_NO: null, DIST: 0.1, RNUM: 2 };

describe("normalizeRows", () => {
  test("열은 이름순, 행은 콘텐츠 ID순으로 정렬하고 DIST·RNUM은 뺀다", () => {
    expect(normalizeRows([a, b])).toEqual({
      columns: ["COT_CONTS_ID", "COT_CONTS_NAME", "COT_TEL_NO"],
      rows: [
        ["a", "하나", null],
        ["b", "둘", ""],
      ],
    });
  });

  test("어떤 행에 없는 열은 null로 채운다", () => {
    expect(normalizeRows([{ COT_CONTS_ID: "a" }, { COT_CONTS_ID: "b", EXTRA: 1 }]).rows).toEqual([
      ["a", null],
      ["b", 1],
    ]);
  });

  test("같은 ID의 행은 입력 순서와 관계없이 내용순으로 놓인다", () => {
    const x = { COT_CONTS_ID: "dup", COT_CONTS_NAME: "가" };
    const y = { COT_CONTS_ID: "dup", COT_CONTS_NAME: "나" };
    expect(normalizeRows([x, y])).toEqual(normalizeRows([y, x]));
  });
});

describe("contentHash", () => {
  test("행 순서나 DIST·RNUM만 다르면 해시가 같다", () => {
    const moved = [
      { ...b, DIST: 9, RNUM: 7 },
      { ...a, DIST: 3, RNUM: 8 },
    ];
    expect(contentHash(normalizeRows(moved))).toBe(contentHash(normalizeRows([a, b])));
  });

  test("값이 하나라도 바뀌면 해시가 달라진다", () => {
    expect(contentHash(normalizeRows([{ ...a, COT_CONTS_NAME: "셋" }, b]))).not.toBe(contentHash(normalizeRows([a, b])));
  });

  test("null과 빈 문자열을 구분한다", () => {
    expect(contentHash(normalizeRows([{ ...a, COT_TEL_NO: null }, b]))).not.toBe(contentHash(normalizeRows([a, b])));
  });

  test("sha256 hex 64자", () => {
    expect(contentHash(normalizeRows([a]))).toMatch(/^[0-9a-f]{64}$/);
  });
});
