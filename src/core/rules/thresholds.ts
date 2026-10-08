// 공통 규칙 수치. 2026-10-08 공개 테마 202개(226,974행) 실측으로 정했다.

/** 경계 허용 오차(m). 참조 경계 파일이 단순화돼 있어 이 안의 불일치는 표시하지 않는다. */
export const BOUNDARY_TOLERANCE_M = 100;

/** 같은 이름이 이 거리(m) 안에 있으면 중복 등록 의심. */
export const NEAR_DUPLICATE_M = 30;

/** 같은 좌표에서 이름 유사도가 이 값 이상이면 같은 장소로 본다. */
export const NAME_SIMILARITY = 0.8;

/** 같은 이름이 이보다 많으면 고유 이름이 아니라 분류명(예: "소화기")으로 보고 근접 중복을 보지 않는다. */
export const DISTINCT_NAME_MAX_COUNT = 4;

/** 구명이 비어 있는 행이 이 비율 이상이면 행마다 지적하지 않고 테마 수준 1건으로 묶는다. */
export const MOSTLY_EMPTY_RATIO = 0.9;

/** 한 대표 이미지를 이 비율 이상의 행이 함께 쓰면(전체가 쓰는 경우 제외) 정보로 알린다. */
export const IMAGE_REUSE_RATIO = 0.5;
