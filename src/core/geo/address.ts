import { SEOUL_DISTRICTS } from "./seoulDistricts.ts";

export type AddressArea = {
  /** 서울 주소면 true, 다른 시도면 false, 판단할 수 없으면 null. */
  readonly inSeoul: boolean | null;
  /** 주소에 적힌 서울 자치구. 없거나 읽을 수 없으면 null. */
  readonly gu: string | null;
};

const UNKNOWN: AddressArea = { inSeoul: null, gu: null };
const SEOUL_PREFIX = /^(서울특별시|서울시|서울)(.*)$/s;
const OTHER_PROVINCE = /^(부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/;
const HANGUL = /[가-힣]/;

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
  if (gu) return { inSeoul: true, gu };
  if (OTHER_PROVINCE.test(value)) return { inSeoul: false, gu: null };
  return UNKNOWN;
}

function leadingDistrict(value: string): string | null {
  return SEOUL_DISTRICTS.find((name) => value.startsWith(name) && !HANGUL.test(value.charAt(name.length))) ?? null;
}
