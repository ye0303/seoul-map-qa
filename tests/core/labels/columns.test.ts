import { expect, test } from "vitest";

import edition25 from "../../fixtures/edition25.json" with { type: "json" };
import { columnLabels } from "../../../src/core/labels/columns.ts";
import { normalizeRows } from "../../../src/core/model/snapshot.ts";

test("고정 열은 한글 이름, 상세정보 값은 테마의 제목, 모르는 열은 그대로", () => {
  const labels = columnLabels(normalizeRows(edition25.rows));
  expect(labels.get("COT_GU_NAME")).toBe("구명");
  expect(labels.get("COT_TEL_NO")).toBe("전화번호");
  expect(labels.get("COT_VALUE_01")).toBe("장소소개");
  expect(labels.get("COT_VALUE_03")).toBe("서울에디션25란?");
  expect(labels.get("COT_NAME_01")).toBe("상세정보 1 제목");
  expect(columnLabels({ columns: ["NEW_FIELD"], rows: [] }).get("NEW_FIELD")).toBe("NEW_FIELD");
});

test("제목이 비어 있으면 '상세정보 n'", () => {
  const labels = columnLabels({ columns: ["COT_NAME_02", "COT_VALUE_02"], rows: [["", "값"]] });
  expect(labels.get("COT_VALUE_02")).toBe("상세정보 2");
});
