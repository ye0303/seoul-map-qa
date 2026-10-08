import { parseAddress, type AddressArea } from "../geo/address.ts";
import type { DistrictIndex } from "../geo/districtIndex.ts";
import { coordinate, text, type ContentRow } from "../model/row.ts";
import { compareRows } from "../model/snapshot.ts";

export type CoordinateStatus = "ok" | "missing" | "swapped" | "outOfRange";

/** 규칙들이 함께 쓰는 행 단위 파생값. 행마다 한 번만 계산한다. */
export type RowFacts = {
  /** 콘텐츠 ID. 같은 ID가 여럿이면 행 내용순으로 `ID#1`, `ID#2`… */
  readonly key: string;
  readonly row: ContentRow;
  readonly name: string;
  readonly guName: string;
  readonly subcategory: string;
  readonly lng: number | null;
  readonly lat: number | null;
  readonly coordinateStatus: CoordinateStatus;
  /** 점(Point) 콘텐츠인지. 선·면 콘텐츠의 X/Y는 대표점이라 구 판정에 쓰지 않는다. */
  readonly isPoint: boolean;
  /** 좌표가 정상인 점 콘텐츠의 위치 키(소수 6자리, 약 10cm). 그 밖에는 null. */
  readonly pointKey: string | null;
  /** 좌표가 정상인 점 콘텐츠가 속한 자치구. 서울 밖이거나 판정 대상이 아니면 null. */
  readonly coordinateDistrict: string | null;
  /** 새 주소를 먼저 읽고, 판단할 수 없으면 옛 주소를 읽은 결과. */
  readonly address: AddressArea;
  readonly addressField: "COT_ADDR_FULL_NEW" | "COT_ADDR_FULL_OLD";
};

export function buildFacts(rows: readonly ContentRow[], districts: DistrictIndex): RowFacts[] {
  const keys = rowKeys(rows);
  return rows.map((row, index) => {
    const lng = coordinate(row, "COT_COORD_X");
    const lat = coordinate(row, "COT_COORD_Y");
    const coordinateStatus = classifyCoordinate(lng, lat);
    const isPoint = ["", "1"].includes(text(row, "COT_COORD_TYPE"));
    const locatable = isPoint && coordinateStatus === "ok";
    const newAddress = parseAddress(text(row, "COT_ADDR_FULL_NEW"));
    const useNew = newAddress.inSeoul !== null;
    return {
      key: keys[index]!,
      row,
      name: text(row, "COT_CONTS_NAME"),
      guName: text(row, "COT_GU_NAME"),
      subcategory: text(row, "COT_THEME_SUB_ID"),
      lng,
      lat,
      coordinateStatus,
      isPoint,
      pointKey: locatable ? `${lng!.toFixed(6)},${lat!.toFixed(6)}` : null,
      coordinateDistrict: locatable ? districts.districtAt(lng!, lat!) : null,
      address: useNew ? newAddress : parseAddress(text(row, "COT_ADDR_FULL_OLD")),
      addressField: useNew ? "COT_ADDR_FULL_NEW" : "COT_ADDR_FULL_OLD",
    };
  });
}

/** 국내 경위도 범위(경도 124~132, 위도 33~39) 기준 분류. */
export function classifyCoordinate(lng: number | null, lat: number | null): CoordinateStatus {
  if (lng === null || lat === null) return "missing";
  if (lng >= 33 && lng <= 39 && lat >= 124 && lat <= 132) return "swapped";
  if (lng < 124 || lng > 132 || lat < 33 || lat > 39) return "outOfRange";
  return "ok";
}

/** 콘텐츠 ID가 겹치면 스냅샷과 같은 행 순서로 순번을 붙여 API 응답 순서와 무관하게 고정한다. */
function rowKeys(rows: readonly ContentRow[]): string[] {
  const ids = rows.map((row) => String(row["COT_CONTS_ID"] ?? ""));
  const groups = new Map<string, number[]>();
  ids.forEach((id, index) => (groups.get(id) ?? groups.set(id, []).get(id)!).push(index));
  const keys = [...ids];
  for (const [id, indexes] of groups) {
    if (indexes.length < 2) continue;
    indexes.sort((a, b) => compareRows(rows[a]!, rows[b]!));
    indexes.forEach((rowIndex, order) => (keys[rowIndex] = `${id}#${order + 1}`));
  }
  return keys;
}
