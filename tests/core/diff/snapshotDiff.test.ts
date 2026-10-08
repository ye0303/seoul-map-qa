import { describe, expect, test } from "vitest";

import { diffSnapshots, rowsFromSnapshot, snapshotRowKeys } from "../../../src/core/diff/snapshotDiff.ts";
import { normalizeRows } from "../../../src/core/model/snapshot.ts";
import { check, row } from "../../helpers.ts";

describe("snapshotRowKeys", () => {
  test("같은 ID는 저장 순서대로 ID#n — 판정의 contsId와 같은 행을 가리킨다", () => {
    const rows = [
      row({ COT_CONTS_ID: "dup", COT_CONTS_NAME: "나" }),
      row({ COT_CONTS_ID: "solo", COT_CONTS_NAME: "혼자" }),
      row({ COT_CONTS_ID: "dup", COT_CONTS_NAME: "가", COT_TEL_NO: "28159575" }),
    ];
    const snapshot = normalizeRows(rows);
    const keys = snapshotRowKeys(snapshot);
    expect(keys).toEqual(["dup#1", "dup#2", "solo"]);
    // 전화번호가 틀린 행("가")의 스냅샷 키와 C-10 판정의 contsId가 같아야 한다
    const nameColumn = snapshot.columns.indexOf("COT_CONTS_NAME");
    const keyOfGa = keys[snapshot.rows.findIndex((values) => values[nameColumn] === "가")];
    expect(check(rows).filter((finding) => finding.ruleId === "C-10").map((finding) => finding.contsId)).toEqual([keyOfGa]);
  });
});

describe("rowsFromSnapshot", () => {
  test("정규화한 스냅샷을 행 객체로 되돌리면 다시 정규화해도 같다", () => {
    const snapshot = normalizeRows([row({ COT_CONTS_ID: "b", DIST: 1 }), row({ COT_CONTS_ID: "a", COT_TEL_NO: null })]);
    expect(normalizeRows(rowsFromSnapshot(snapshot))).toEqual(snapshot);
  });

  test("되돌린 행으로 다시 검사하면 원래 행과 판정이 같다", () => {
    const rows = [row({ COT_CONTS_ID: "a", COT_TEL_NO: "02-350-5233%7E5244" }), row({ COT_CONTS_ID: "b", COT_GU_NAME: "구로구" })];
    expect(check(rowsFromSnapshot(normalizeRows(rows)))).toEqual(check(rows));
  });
});

describe("diffSnapshots", () => {
  const before = normalizeRows([row({ COT_CONTS_ID: "keep" }), row({ COT_CONTS_ID: "edit", COT_TEL_NO: "02-1" }), row({ COT_CONTS_ID: "gone" })]);

  test("추가·삭제·변경을 행 키와 필드 단위로 낸다", () => {
    const after = normalizeRows([row({ COT_CONTS_ID: "keep" }), row({ COT_CONTS_ID: "edit", COT_TEL_NO: "02-2" }), row({ COT_CONTS_ID: "new" })]);
    expect(diffSnapshots(before, after)).toEqual({
      added: ["new"],
      removed: ["gone"],
      modified: [{ key: "edit", fields: [{ column: "COT_TEL_NO", before: "02-1", after: "02-2" }] }],
    });
  });

  test("DIST·RNUM만 다르면 차이가 없다", () => {
    const after = normalizeRows([row({ COT_CONTS_ID: "gone", DIST: 9 }), row({ COT_CONTS_ID: "edit", COT_TEL_NO: "02-1", RNUM: 3 }), row({ COT_CONTS_ID: "keep" })]);
    expect(diffSnapshots(before, after)).toEqual({ added: [], removed: [], modified: [] });
  });

  test("열 구성이 바뀌면 없는 쪽 값을 undefined로 비교한다", () => {
    const narrow = { columns: ["COT_CONTS_ID"], rows: [["a"]] };
    const wide = { columns: ["COT_CONTS_ID", "EXTRA"], rows: [["a", null]] };
    expect(diffSnapshots(narrow, wide).modified).toEqual([{ key: "a", fields: [{ column: "EXTRA", before: undefined, after: null }] }]);
  });
});
