/** 과거 버전 파일을 읽어 오는 GitHub 저장소(공개, D-019). 태그별 파일은 raw 주소로 받는다(D-053). */
export const REPOSITORY = "ye0303/seoul-map-qa";
export const RAW_BASE = `https://raw.githubusercontent.com/${REPOSITORY}`;

/** 지금 버전 data/는 대시보드와 같은 곳에서 읽는다(Pages 배포에 함께 들어간다). */
export const DATA_BASE = "data/";

/** 표 한 쪽에 보이는 행 수. */
export const PAGE_SIZE = 100;
