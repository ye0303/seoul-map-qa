import { isSeoulDistrict } from "../../geo/seoulDistricts.ts";
import { BOUNDARY_TOLERANCE_M } from "../thresholds.ts";
import type { FindingDraft, Rule } from "../types.ts";

export const missingCoordinate: Rule = {
  id: "C-01",
  title: "좌표 없음",
  check: ({ facts }) =>
    facts
      .filter((fact) => fact.coordinateStatus === "missing")
      .map((fact) => ({
        severity: "error",
        contsId: fact.key,
        field: "COT_COORD_X",
        message: "좌표(경도·위도)가 비어 있거나 숫자가 아닙니다.",
      })),
};

export const swappedCoordinate: Rule = {
  id: "C-02",
  title: "위경도 뒤바뀜",
  check: ({ facts }) =>
    facts
      .filter((fact) => fact.coordinateStatus === "swapped")
      .map((fact) => ({
        severity: "error",
        contsId: fact.key,
        field: "COT_COORD_X",
        value: `경도 ${fact.lng}, 위도 ${fact.lat}`,
        suggestion: `경도 ${fact.lat}, 위도 ${fact.lng}`,
        message: "경도와 위도가 서로 바뀌어 들어가 있습니다.",
      })),
};

export const outOfRangeCoordinate: Rule = {
  id: "C-03",
  title: "국내 범위 밖 좌표",
  check: ({ facts }) =>
    facts
      .filter((fact) => fact.coordinateStatus === "outOfRange")
      .map((fact) => ({
        severity: "error",
        contsId: fact.key,
        field: "COT_COORD_X",
        value: `경도 ${fact.lng}, 위도 ${fact.lat}`,
        message: "좌표가 국내 범위(경도 124~132, 위도 33~39)를 벗어났습니다.",
      })),
};

/**
 * 좌표가 서울 밖인 점 콘텐츠. 주소·구명이 서울이면 오류, 근거가 없으면 의심.
 * 주소도 서울 밖이면 정상적인 서울 밖 장소로 보고 테마 수준 정보 1건으로만 센다.
 */
export const outsideSeoul: Rule = {
  id: "C-04",
  title: "서울 밖 좌표",
  check: ({ facts, districts }) => {
    const findings: FindingDraft[] = [];
    let consistentOutside = 0;
    for (const fact of facts) {
      if (!fact.isPoint || fact.coordinateStatus !== "ok" || fact.coordinateDistrict !== null) continue;
      const distance = districts.distanceToSeoulM(fact.lng!, fact.lat!);
      if (distance <= BOUNDARY_TOLERANCE_M) continue;
      const claimsSeoul = fact.address.inSeoul === true || (fact.address.inSeoul === null && isSeoulDistrict(fact.guName));
      if (fact.address.inSeoul === false && !claimsSeoul) {
        consistentOutside++;
        continue;
      }
      findings.push({
        severity: claimsSeoul ? "error" : "suspect",
        contsId: fact.key,
        field: "COT_COORD_X",
        value: `경도 ${fact.lng}, 위도 ${fact.lat}`,
        message: claimsSeoul
          ? `주소·구명은 서울인데 좌표는 서울 밖(약 ${formatDistance(distance)})에 있습니다.`
          : `좌표가 서울 밖(약 ${formatDistance(distance)})에 있고 주소가 없어 확인이 필요합니다.`,
      });
    }
    if (consistentOutside > 0) {
      findings.push({
        severity: "info",
        contsId: null,
        groupKey: "outside",
        message: `서울 밖 장소가 ${consistentOutside}건 있습니다(주소도 서울 밖).`,
      });
    }
    return findings;
  },
};

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}
