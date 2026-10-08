/** 비교용 이름: 소문자, 공백·문장부호·기호 제거. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}
