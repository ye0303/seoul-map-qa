import { compareCodeUnits, VOLATILE_COLUMNS } from "../../model/snapshot.ts";
import type { RowFacts } from "../facts.ts";
import { normalizeName, withoutSpotQualifiers } from "../names.ts";
import { DISTINCT_NAME_MAX_COUNT, NAME_SIMILARITY, NEAR_DUPLICATE_M } from "../thresholds.ts";
import type { FindingDraft, Rule } from "../types.ts";

/** 완전 중복 판정에서 빼는 열: 행마다 달라도 같은 등록으로 보는 값. */
const IGNORED_FOR_SAME_CONTENT = new Set(["COT_CONTS_ID", "COT_REG_DATE", "COT_UPDATE_DATE", ...VOLATILE_COLUMNS]);

/** 한 좌표에 서로 다른 이름이 이보다 많으면(행사장 등) 비슷한 이름 비교를 건너뛰고 같은 이름만 본다. */
const FUZZY_COMPARE_MAX_NAMES = 50;

/**
 * 중복 등록 의심. ① ID·등록일만 다르고 내용이 같은 행 ② 같은 좌표·같은 분류(서브카테고리)에
 * 이름이 같거나 비슷한 행. 분류가 다르면 한 장소를 여러 분류에 올린 것으로 보고 제외한다.
 */
export const duplicateEntry: Rule = {
  id: "C-08",
  title: "중복 등록 의심",
  check: ({ facts }) => {
    const findings: FindingDraft[] = [];
    for (const group of groupBy(facts, sameContentKey)) {
      if (group.length < 2) continue;
      const groupKey = `same:${minKey(group)}`;
      const message = `ID만 다르고 내용이 같은 행이 ${group.length}건 있습니다: ${listKeys(group)}`;
      for (const fact of group) findings.push({ severity: "suspect", contsId: fact.key, groupKey, message });
    }
    const points = facts.filter((fact) => fact.pointKey !== null);
    for (const group of groupBy(points, (fact) => `${fact.pointKey}|${fact.subcategory}`)) {
      if (group.length < 2) continue;
      for (const component of sameOrSimilarNames(group)) {
        const groupKey = `coord:${minKey(component)}`;
        const message = `같은 좌표·같은 분류에 이름이 같거나 비슷한 행이 ${component.length}건 있습니다: ${listKeys(component)}`;
        for (const fact of component) {
          findings.push({ severity: "suspect", contsId: fact.key, groupKey, field: "COT_CONTS_NAME", value: fact.name, message });
        }
      }
    }
    return findings;
  },
};

/** 가까운 곳(30m 이내)에 같은 이름·같은 분류의 행. 테마 안에서 흔한 이름(분류명)은 보지 않는다. */
export const nearbySameName: Rule = {
  id: "C-09",
  title: "가까운 곳에 같은 이름",
  check: ({ facts }) => {
    const nameCounts = new Map<string, number>();
    for (const fact of facts) {
      const name = normalizeName(fact.name);
      if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    const candidates = facts.filter((fact) => {
      const count = nameCounts.get(normalizeName(fact.name)) ?? 0;
      return fact.pointKey !== null && count >= 2 && count <= DISTINCT_NAME_MAX_COUNT;
    });
    const findings: FindingDraft[] = [];
    for (const group of groupBy(candidates, (fact) => `${normalizeName(fact.name)}|${fact.subcategory}`)) {
      const near = (a: RowFacts, b: RowFacts) => {
        const distance = metersBetween(a, b);
        return distance > 0.1 && distance <= NEAR_DUPLICATE_M;
      };
      for (const component of components(group, near)) {
        const groupKey = `near:${minKey(component)}`;
        const message = `${NEAR_DUPLICATE_M}m 안에 이름이 같은 행이 ${component.length}건 있습니다: ${listKeys(component)}`;
        for (const fact of component) {
          findings.push({ severity: "suspect", contsId: fact.key, groupKey, field: "COT_CONTS_NAME", value: fact.name, message });
        }
      }
    }
    return findings;
  },
};

/** 같은 테마 안에서 콘텐츠 ID가 겹침. 버전 비교의 기준 키라서 오류로 본다. */
export const duplicateId: Rule = {
  id: "C-15",
  title: "콘텐츠 ID 중복",
  check: ({ facts }) =>
    groupBy(facts, (fact) => String(fact.row["COT_CONTS_ID"] ?? ""))
      .filter((group) => group.length > 1)
      .flatMap((group) =>
        group.map((fact) => ({
          severity: "error" as const,
          contsId: fact.key,
          field: "COT_CONTS_ID",
          value: String(fact.row["COT_CONTS_ID"] ?? ""),
          message: `콘텐츠 ID가 ${group.length}건 겹칩니다.`,
        })),
      ),
};

/** 이름 유사도(1 - 편집거리/긴 쪽 길이)가 기준 이상인지. */
export function isSimilarName(a: string, b: string): boolean {
  const longest = Math.max(a.length, b.length);
  const maxDistance = Math.floor(longest * (1 - NAME_SIMILARITY) + 1e-9);
  return Math.abs(a.length - b.length) <= maxDistance && editDistanceWithin(a, b, maxDistance) <= maxDistance;
}

/**
 * 한 좌표 묶음 안에서 이름이 같거나 비슷한 행끼리 묶는다. 같은 이름은 한 덩어리로 먼저 모으고,
 * 서로 다른 이름끼리만 비교해 행 수가 많은 좌표(행사장 등)에서도 빠르게 끝난다.
 */
function sameOrSimilarNames(group: readonly RowFacts[]): RowFacts[][] {
  const byName = new Map<string, RowFacts[]>();
  for (const fact of group) {
    const name = normalizeName(fact.name);
    if (name) (byName.get(name) ?? byName.set(name, []).get(name)!).push(fact);
  }
  const names = [...byName.keys()];
  const parent = names.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index]!)));
  if (names.length <= FUZZY_COMPARE_MAX_NAMES) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i]!;
        const b = names[j]!;
        const sameSpot = withoutSpotQualifiers(byName.get(a)![0]!.name) === withoutSpotQualifiers(byName.get(b)![0]!.name);
        if (!sameSpot && isSimilarName(a, b)) parent[find(i)] = find(j);
      }
    }
  }
  const merged = new Map<number, RowFacts[]>();
  names.forEach((name, index) => (merged.get(find(index)) ?? merged.set(find(index), []).get(find(index))!).push(...byName.get(name)!));
  return [...merged.values()].filter((component) => component.length > 1);
}

/** 편집거리. max를 넘는 것이 확실해지면 max + 1을 돌려주고 멈춘다. */
function editDistanceWithin(a: string, b: string, max: number): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}

function sameContentKey(fact: RowFacts): string {
  return JSON.stringify(
    Object.keys(fact.row)
      .filter((column) => !IGNORED_FOR_SAME_CONTENT.has(column))
      .sort(compareCodeUnits)
      .map((column) => fact.row[column] ?? null),
  );
}

function groupBy(facts: readonly RowFacts[], keyOf: (fact: RowFacts) => string): RowFacts[][] {
  const groups = new Map<string, RowFacts[]>();
  for (const fact of facts) {
    const key = keyOf(fact);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(fact);
  }
  return [...groups.values()];
}

/** linked(a, b)로 이어지는 행끼리 묶은 연결 요소 중 2건 이상인 것. */
function components(group: readonly RowFacts[], linked: (a: RowFacts, b: RowFacts) => boolean): RowFacts[][] {
  const parent = group.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index]!)));
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (linked(group[i]!, group[j]!)) parent[find(i)] = find(j);
    }
  }
  const byRoot = new Map<number, RowFacts[]>();
  group.forEach((fact, index) => (byRoot.get(find(index)) ?? byRoot.set(find(index), []).get(find(index))!).push(fact));
  return [...byRoot.values()].filter((component) => component.length > 1);
}

function minKey(group: readonly RowFacts[]): string {
  return group.map((fact) => fact.key).sort(compareCodeUnits)[0]!;
}

function listKeys(group: readonly RowFacts[]): string {
  const keys = group.map((fact) => fact.key).sort(compareCodeUnits);
  return keys.length <= 5 ? keys.join(", ") : `${keys.slice(0, 5).join(", ")} 외 ${keys.length - 5}건`;
}

function metersBetween(a: RowFacts, b: RowFacts): number {
  const metersPerDegree = (Math.PI / 180) * 6_371_008.8;
  const kx = Math.cos((a.lat! * Math.PI) / 180) * metersPerDegree;
  return Math.hypot((a.lng! - b.lng!) * kx, (a.lat! - b.lat!) * metersPerDegree);
}
