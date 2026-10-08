/** 서울 25개 자치구, 가나다순. 서울에디션25 콘텐츠 ID의 구 번호(1~25)가 이 순서를 따른다. */
export const SEOUL_DISTRICTS = [
  "강남구",
  "강동구",
  "강북구",
  "강서구",
  "관악구",
  "광진구",
  "구로구",
  "금천구",
  "노원구",
  "도봉구",
  "동대문구",
  "동작구",
  "마포구",
  "서대문구",
  "서초구",
  "성동구",
  "성북구",
  "송파구",
  "양천구",
  "영등포구",
  "용산구",
  "은평구",
  "종로구",
  "중구",
  "중랑구",
] as const;

export function isSeoulDistrict(name: string): boolean {
  return (SEOUL_DISTRICTS as readonly string[]).includes(name);
}
