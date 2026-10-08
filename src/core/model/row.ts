/** OpenAPI 콘텐츠 한 행. 값은 API가 준 그대로 둔다. */
export type ContentRow = Readonly<Record<string, unknown>>;

export type ThemeMeta = {
  readonly id: string;
  readonly name: string;
};

export type ThemeData = {
  readonly meta: ThemeMeta;
  readonly rows: readonly ContentRow[];
};

/** 문자열 필드를 앞뒤 공백 없이 읽는다. 값이 없으면 빈 문자열. */
export function text(row: ContentRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** 좌표 필드를 숫자로 읽는다. 비었거나 숫자가 아니면 null. */
export function coordinate(row: ContentRow, key: string): number | null {
  const value = row[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
