import type { Snapshot } from "../model/snapshot.ts";

/** OpenAPI 콘텐츠 열의 한글 이름(API 문서 4.2·4.3). 화면과 엑셀(M5)에서 쓴다. */
const COLUMN_LABELS: Readonly<Record<string, string>> = {
  COT_CONTS_ID: "콘텐츠 ID",
  COT_CONTS_NAME: "이름",
  COT_THEME_ID: "테마 ID",
  THM_THEME_NAME: "테마 이름",
  THM_THEME_TYPE: "테마 분류",
  COT_THEME_SUB_ID: "분류(서브카테고리)",
  COT_GU_NAME: "구명",
  COT_DONG_NAME: "동명",
  COT_ADDR_FULL_NEW: "도로명 주소",
  COT_ADDR_FULL_OLD: "지번 주소",
  COT_EXTRA_NAME: "나머지 주소",
  COT_MASTER_NO: "주 번지",
  COT_SLAVE_NO: "부 번지",
  COT_SAN_NAME: "산 여부",
  COT_COORD_X: "경도(X)",
  COT_COORD_Y: "위도(Y)",
  COT_COORD_TYPE: "좌표 타입",
  THM_COORD_TYPE: "테마 좌표 타입",
  COT_COORD_DATA: "좌표 배열",
  COT_MBR_MIN_X: "영역 최소 경도",
  COT_MBR_MIN_Y: "영역 최소 위도",
  COT_MBR_MAX_X: "영역 최대 경도",
  COT_MBR_MAX_Y: "영역 최대 위도",
  COT_TEL_NO: "전화번호",
  COT_IMG_MAIN_URL: "대표 이미지",
  COT_EXTRA_DATA_01: "추가 이미지",
  COT_KW: "키워드",
  COT_REG_DATE: "등록일",
  COT_UPDATE_DATE: "수정일",
  COT_CONTS_STAT: "사용 상태",
  COT_CONTS_LAN_TYPE: "언어",
  COT_LINE_COLOR: "선 색상",
  COT_LINE_PATTERN: "선 모양",
  COT_LINE_WEIGHT: "선 굵기",
  COT_NATION_BASE_AREA: "국가기초구역",
  COT_NATION_POINT_NUMBER: "국가지점번호",
};

const DETAIL_VALUE = /^COT_VALUE_(\d{2})$/;
const DETAIL_NAME = /^COT_NAME_(\d{2})$/;

/**
 * 스냅샷 열마다 한글 이름. 상세정보 값(COT_VALUE_nn)은 그 테마의 제목(COT_NAME_nn)에서
 * 가장 많이 쓴 값을 이름으로 쓴다(예: 서울에디션25의 COT_VALUE_01 → "장소소개").
 */
export function columnLabels(snapshot: Snapshot): Map<string, string> {
  const labels = new Map<string, string>();
  for (const column of snapshot.columns) {
    const value = DETAIL_VALUE.exec(column);
    labels.set(column, (value && mostCommonTitle(snapshot, `COT_NAME_${value[1]}`)) || columnLabel(column));
  }
  return labels;
}

/** 열 하나의 한글 이름. 스냅샷 없이 쓸 때라 상세정보 값은 제목 대신 "상세정보 n"이다. */
export function columnLabel(column: string): string {
  const value = DETAIL_VALUE.exec(column);
  const name = DETAIL_NAME.exec(column);
  if (value) return `상세정보 ${Number(value[1])}`;
  if (name) return `상세정보 ${Number(name[1])} 제목`;
  return COLUMN_LABELS[column] ?? column;
}

function mostCommonTitle(snapshot: Snapshot, titleColumn: string): string | null {
  const index = snapshot.columns.indexOf(titleColumn);
  if (index === -1) return null;
  const counts = new Map<string, number>();
  for (const row of snapshot.rows) {
    const title = String(row[index] ?? "").trim();
    if (title) counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [title, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && title < best)) {
      best = title;
      bestCount = count;
    }
  }
  return best;
}
