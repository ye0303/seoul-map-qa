import { SEOUL_DISTRICTS } from "./seoulDistricts.ts";

export type AddressArea = {
  /** 서울 주소면 true, 다른 시도면 false, 판단할 수 없으면 null. */
  readonly inSeoul: boolean | null;
  /** 주소에 적힌 서울 자치구. 없거나 읽을 수 없으면 null. */
  readonly gu: string | null;
  /** 시도 없이 다른 광역시에도 있는 구 이름(중구·강서구)만으로 서울이라고 읽은 경우. 좌표로 확인해야 한다. */
  readonly ambiguous?: true;
};

const UNKNOWN: AddressArea = { inSeoul: null, gu: null };
const SEOUL_PREFIX = /^(서울특별시|서울시|서울)(.*)$/s;
const OTHER_PROVINCE = /^(부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/;
const HANGUL = /[가-힣]/;
/** 서울 말고 다른 광역시에도 있는 구 이름. */
const SHARED_DISTRICT_NAMES: readonly string[] = ["중구", "강서구"];

/** 주소 문자열 앞머리에서 시도와 자치구를 읽는다. */
export function parseAddress(address: string): AddressArea {
  const value = address.trim();
  if (value === "") return UNKNOWN;
  const seoul = SEOUL_PREFIX.exec(value);
  if (seoul) {
    const rest = seoul[2] ?? "";
    if (rest === "" || /^\s/.test(rest)) return { inSeoul: true, gu: leadingDistrict(rest.trimStart()) };
    const gu = leadingDistrict(rest);
    if (gu) return { inSeoul: true, gu };
  }
  const gu = leadingDistrict(value);
  if (gu) return SHARED_DISTRICT_NAMES.includes(gu) ? { inSeoul: true, gu, ambiguous: true } : { inSeoul: true, gu };
  if (OTHER_PROVINCE.test(value)) return { inSeoul: false, gu: null };
  return UNKNOWN;
}

function leadingDistrict(value: string): string | null {
  return SEOUL_DISTRICTS.find((name) => value.startsWith(name) && !HANGUL.test(value.charAt(name.length))) ?? null;
}
