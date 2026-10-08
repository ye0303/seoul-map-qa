import { isSeoulDistrict } from "../../geo/seoulDistricts.ts";
import type { RowFacts } from "../facts.ts";
import { normalizeName } from "../names.ts";
import { BOUNDARY_TOLERANCE_M, MOSTLY_EMPTY_RATIO } from "../thresholds.ts";
import type { FindingDraft, Rule } from "../types.ts";

/**
 * 구명과 좌표가 가리키는 구가 다름.
 * 주소도 좌표 쪽이면 구명이 틀린 것(경계 근처면 의심), 그 밖에는 좌표가 구명의 구에서
 * 허용 오차보다 멀 때만 의심. 경계 파일 정밀도 안의 차이는 표시하지 않는다.
 * 이름이 다른 여러 장소가 한 좌표를 함께 쓰면 좌표·주소가 대표값으로 잘못 들어간 경우가 많아
 * 구명을 고치라고 제안하지 않는다.
 */
export const districtMismatchCoordinate: Rule = {
  id: "C-05",
  title: "구명과 좌표의 구 불일치",
  check: ({ facts, districts }) => {
    const findings: FindingDraft[] = [];
    const namesAtPoint = namesByPoint(facts);
    for (const fact of facts) {
      const coordinateDistrict = fact.coordinateDistrict;
      if (coordinateDistrict === null || fact.guName === "" || fact.guName === coordinateDistrict) continue;
      const base = { contsId: fact.key, field: "COT_GU_NAME", value: fact.guName } as const;
      if (!isSeoulDistrict(fact.guName)) {
        findings.push({
          ...base,
          severity: "suspect",
          suggestion: coordinateDistrict,
          message: `구명(${fact.guName})이 서울 자치구가 아닌데 좌표는 ${coordinateDistrict}에 있습니다.`,
        });
        continue;
      }
      const distance = districts.distanceToDistrictM(fact.guName, fact.lng!, fact.lat!);
      const placesSharingPoint = (namesAtPoint.get(fact.pointKey!)?.size ?? 1) - 1;
      if (fact.address.gu === coordinateDistrict && placesSharingPoint > 0) {
        findings.push({
          ...base,
          severity: "suspect",
          message: `구명(${fact.guName})과 좌표·주소의 구(${coordinateDistrict})가 다릅니다. 이 좌표를 이름이 다른 장소 ${placesSharingPoint}곳이 함께 쓰고 있어 좌표·주소가 잘못 들어갔을 수 있습니다.`,
        });
      } else if (fact.address.gu === coordinateDistrict) {
        findings.push({
          ...base,
          severity: distance > BOUNDARY_TOLERANCE_M ? "error" : "suspect",
          suggestion: coordinateDistrict,
          message:
            distance > BOUNDARY_TOLERANCE_M
              ? `구명(${fact.guName})이 좌표·주소의 구(${coordinateDistrict})와 다릅니다.`
              : `구명(${fact.guName})이 좌표·주소의 구(${coordinateDistrict})와 다릅니다. 구 경계 근처라 확인이 필요합니다.`,
        });
      } else if (distance > BOUNDARY_TOLERANCE_M) {
        const addressAgrees = fact.address.gu === fact.guName;
        findings.push({
          ...base,
          severity: "suspect",
          ...(addressAgrees ? {} : { suggestion: coordinateDistrict }),
          message: addressAgrees
            ? `좌표가 ${coordinateDistrict}에 있어 구명·주소(${fact.guName})와 다릅니다. 좌표가 틀렸을 수 있습니다.`
            : `구명(${fact.guName})과 좌표의 구(${coordinateDistrict})가 다릅니다.`,
        });
      }
    }
    return findings;
  },
};

/** 위치 키별로 그 좌표를 쓰는 서로 다른 이름. */
function namesByPoint(facts: readonly RowFacts[]): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>();
  for (const fact of facts) {
    if (fact.pointKey === null) continue;
    (names.get(fact.pointKey) ?? names.set(fact.pointKey, new Set()).get(fact.pointKey)!).add(normalizeName(fact.name));
  }
  return names;
}

/** 구명과 주소의 구가 다름. 좌표가 주소 쪽이면 C-05가 이미 잡는다. */
export const districtMismatchAddress: Rule = {
  id: "C-06",
  title: "구명과 주소의 구 불일치",
  check: ({ facts, districts }) => {
    const findings: FindingDraft[] = [];
    for (const fact of facts) {
      const addressDistrict = fact.address.gu;
      if (addressDistrict === null || !isSeoulDistrict(fact.guName) || fact.guName === addressDistrict) continue;
      if (fact.coordinateDistrict === addressDistrict) continue;
      if (fact.coordinateDistrict === fact.guName) {
        if (districts.distanceToDistrictM(addressDistrict, fact.lng!, fact.lat!) <= BOUNDARY_TOLERANCE_M) continue;
        findings.push({
          severity: "suspect",
          contsId: fact.key,
          field: fact.addressField,
          value: addressDistrict,
          message: `주소의 구(${addressDistrict})가 구명·좌표의 구(${fact.guName})와 다릅니다. 주소를 확인해 주세요.`,
        });
        continue;
      }
      findings.push({
        severity: "suspect",
        contsId: fact.key,
        field: "COT_GU_NAME",
        value: fact.guName,
        message: `구명(${fact.guName})과 주소의 구(${addressDistrict})가 다릅니다.`,
      });
    }
    return findings;
  },
};

/** 구명 빈 값. 테마 대부분이 비어 있으면 테마가 구명을 쓰지 않는 것으로 보고 1건으로 묶는다. */
export const districtEmpty: Rule = {
  id: "C-07",
  title: "구명 비어 있음",
  check: ({ facts }) => {
    const empty = facts.filter((fact) => fact.guName === "");
    if (empty.length === 0) return [];
    if (empty.length / facts.length >= MOSTLY_EMPTY_RATIO) {
      return [
        {
          severity: "info",
          contsId: null,
          groupKey: "mostly-empty",
          field: "COT_GU_NAME",
          message: `구명이 ${facts.length}건 중 ${empty.length}건 비어 있습니다.`,
        },
      ];
    }
    return empty.map((fact) => {
      const suggestion = fact.coordinateDistrict ?? fact.address.gu;
      return {
        severity: "info",
        contsId: fact.key,
        field: "COT_GU_NAME",
        ...(suggestion ? { suggestion } : {}),
        message: "구명이 비어 있습니다.",
      };
    });
  },
};
