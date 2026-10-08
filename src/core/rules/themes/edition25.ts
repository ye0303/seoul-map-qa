import { SEOUL_DISTRICTS } from "../../geo/seoulDistricts.ts";
import { text } from "../../model/row.ts";
import { compareCodeUnits } from "../../model/snapshot.ts";
import type { RowFacts } from "../facts.ts";
import type { FindingDraft, Rule } from "../types.ts";

/** 서울에디션25: 연도별로 자치구마다 1곳. 콘텐츠 ID는 `{연도 두 자리}_edition25_{가나다순 구 번호}`. */
export const EDITION25_THEME_ID = "1786321258890";

const ID_PATTERN = /^(\d{2})_edition25_([1-9]|1\d|2[0-5])$/;
const IMAGE_ID_PATTERN = /\d{2}_edition25_\d{1,2}(?!\d)/;

type ParsedId = { readonly year: string; readonly district: string };

function parseId(fact: RowFacts): ParsedId | null {
  const match = ID_PATTERN.exec(fact.key);
  return match ? { year: match[1]!, district: SEOUL_DISTRICTS[Number(match[2]) - 1]! } : null;
}

export const edition25IdFormat: Rule = {
  id: "T-E25-01",
  title: "서울에디션25 ID 형식",
  check: ({ facts }) =>
    facts
      .filter((fact) => parseId(fact) === null)
      .map((fact) => ({
        severity: "error",
        contsId: fact.key,
        field: "COT_CONTS_ID",
        value: fact.key,
        message: "콘텐츠 ID가 `연도_edition25_구번호(1~25)` 형식이 아닙니다.",
      })),
};

export const edition25IdDistrict: Rule = {
  id: "T-E25-02",
  title: "서울에디션25 ID의 구 번호와 구명 불일치",
  check: ({ facts }) =>
    facts.flatMap((fact): FindingDraft[] => {
      const parsed = parseId(fact);
      if (!parsed || parsed.district === fact.guName) return [];
      return [
        {
          severity: "error",
          contsId: fact.key,
          field: "COT_GU_NAME",
          value: fact.guName,
          suggestion: parsed.district,
          message: `콘텐츠 ID의 구 번호는 ${parsed.district} 자리인데 구명이 ${fact.guName || "비어 있음"}입니다.`,
        },
      ];
    }),
};

export const edition25OnePerDistrict: Rule = {
  id: "T-E25-03",
  title: "서울에디션25 연도별 자치구당 1곳",
  check: ({ facts }) => {
    const years = [...new Set(facts.flatMap((fact) => parseId(fact)?.year ?? []))].sort();
    const findings: FindingDraft[] = [];
    for (const year of years) {
      const ofYear = facts.filter((fact) => parseId(fact)?.year === year);
      for (const district of SEOUL_DISTRICTS) {
        const places = ofYear.filter((fact) => fact.guName === district).sort((a, b) => compareCodeUnits(a.key, b.key));
        if (places.length === 0) {
          findings.push({
            severity: "error",
            contsId: null,
            groupKey: `${year}|${district}`,
            message: `20${year}년 ${district} 장소가 없습니다.`,
          });
        } else if (places.length > 1) {
          for (const fact of places) {
            findings.push({
              severity: "error",
              contsId: fact.key,
              groupKey: `${year}|${district}`,
              field: "COT_GU_NAME",
              value: fact.guName,
              message: `20${year}년 ${district} 장소가 ${places.length}곳입니다(구별 1곳): ${places.map((place) => place.name).join(", ")}`,
            });
          }
        }
      }
    }
    return findings;
  },
};

/** 대표 이미지 파일명에 다른 콘텐츠의 ID가 들어 있음. 파일명 규칙이 확인되지 않아 의심으로 둔다. */
export const edition25ImageId: Rule = {
  id: "T-E25-04",
  title: "서울에디션25 대표 이미지가 다른 장소의 것",
  check: ({ facts }) =>
    facts.flatMap((fact): FindingDraft[] => {
      const url = text(fact.row, "COT_IMG_MAIN_URL");
      const imageId = IMAGE_ID_PATTERN.exec(url.split("/").at(-1) ?? "")?.[0];
      if (!imageId || imageId === fact.key) return [];
      return [
        {
          severity: "suspect",
          contsId: fact.key,
          field: "COT_IMG_MAIN_URL",
          value: url,
          message: `대표 이미지 파일명이 다른 장소(${imageId})의 것입니다.`,
        },
      ];
    }),
};

export const EDITION25_RULES: readonly Rule[] = [edition25IdFormat, edition25IdDistrict, edition25OnePerDistrict, edition25ImageId];
