import { text } from "../../model/row.ts";
import { compareCodeUnits } from "../../model/snapshot.ts";
import { IMAGE_REUSE_RATIO } from "../thresholds.ts";
import type { Rule } from "../types.ts";

export const missingName: Rule = {
  id: "C-11",
  title: "이름 없음",
  check: ({ facts }) =>
    facts
      .filter((fact) => fact.name === "")
      .map((fact) => ({
        severity: "error",
        contsId: fact.key,
        field: "COT_CONTS_NAME",
        message: "콘텐츠 이름이 비어 있습니다.",
      })),
};

/** 대부분의 행이 같은 대표 이미지를 씀. 전체가 같은 이미지(테마 아이콘)면 정상으로 본다. */
export const sharedImage: Rule = {
  id: "C-12",
  title: "대표 이미지 공유",
  check: ({ facts }) => {
    const counts = new Map<string, number>();
    for (const fact of facts) {
      const url = text(fact.row, "COT_IMG_MAIN_URL");
      if (url) counts.set(url, (counts.get(url) ?? 0) + 1);
    }
    const [url, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || compareCodeUnits(a[0], b[0]))[0] ?? ["", 0];
    if (count === facts.length || count / facts.length < IMAGE_REUSE_RATIO) return [];
    return [
      {
        severity: "info",
        contsId: null,
        groupKey: url,
        field: "COT_IMG_MAIN_URL",
        value: url,
        message: `${facts.length}건 중 ${count}건이 같은 대표 이미지를 씁니다.`,
      },
    ];
  },
};
