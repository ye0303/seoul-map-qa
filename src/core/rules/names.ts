/** 비교용 이름: 소문자, 공백·문장부호·기호 제거. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/**
 * 같은 장소 안의 다른 지점을 가리키는 표기를 뺀 이름: "16동 1층", "A동", "(좌)", "(상)", "(2)" 등.
 * 두 이름이 이것만 다르면 같은 장소의 서로 다른 지점으로 본다.
 */
export function withoutSpotQualifiers(name: string): string {
  return normalizeName(name.replace(/\((좌|우|상|하|앞|뒤|동|서|남|북|\d+|[A-Za-z])\)/g, "")).replace(/(\d+|[a-z])(동|층|호)/g, "");
}
