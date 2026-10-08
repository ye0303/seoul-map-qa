import type { ContentRow } from "../model/row.ts";

/** 스마트서울맵 OpenAPI v5. 인증키는 URL 경로에 들어가므로 인코딩한다(D-003). */
const BASE_URL = "https://map.seoul.go.kr/openapi/v5";

/** 한 번에 받는 행 수. 1000으로 3만 행 테마까지 페이지 이상 없이 받았다(D-022). */
export const PAGE_SIZE = 1000;

/** 테마 분류: 1 장애, 2 일반, 4 링크, 5 참여. */
const THEME_TYPES = ["1", "2", "4", "5"] as const;

/** 콘텐츠 API는 기준점·반경을 받지만 이름 검색(search_type=1)에 빈 검색어면 반경을 무시하고 테마 전체를 준다. */
const SEARCH_CENTER = { lng: "126.978462379", lat: "37.566501314" } as const;

/** 페이지 수가 이보다 많으면 응답이 잘못된 것으로 본다(가장 큰 테마도 40페이지 안쪽). */
const MAX_PAGES = 1000;

export type HttpResponse = { readonly status: number; readonly text: string };

/** GET 요청. 배치(Node)와 브라우저가 각자 fetch로 구현해 넘긴다. */
export type HttpGet = (url: string) => Promise<HttpResponse>;

export type PublicTheme = { readonly id: string; readonly name: string; readonly type: string };

export type ContentsResult =
  | { readonly status: "ok"; readonly rows: readonly ContentRow[] }
  /** 인증키에 이 테마 권한이 없음 (HTTP 400, resultCode 400). */
  | { readonly status: "unavailable"; readonly reason: string }
  /** 페이지 정보가 서로 어긋나 전체를 받았다고 볼 수 없음. */
  | { readonly status: "incomplete"; readonly reason: string }
  | { readonly status: "error"; readonly reason: string };

/** 응답 오류. 메시지에 URL(인증키 포함)을 넣지 않는다. */
export class SmartSeoulApiError extends Error {
  readonly name = "SmartSeoulApiError";
}

/** 테마 목록 전체(모든 상태). 공개 여부는 publicThemes로 거른다. */
export async function fetchThemeList(get: HttpGet, key: string): Promise<Readonly<Record<string, unknown>>[]> {
  const items: Readonly<Record<string, unknown>>[] = [];
  for (const themeType of THEME_TYPES) {
    // 참여 테마는 TOTAL_COUNT보다 일찍 빈 페이지가 와서, 목록은 "빈 페이지면 끝"으로 느슨하게 받는다.
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${BASE_URL}/${encodeURIComponent(key)}/public/themes/ko?${query({ theme_type: themeType, page_size: PAGE_SIZE, page_no: page })}`;
      const response = await get(url);
      if (response.status !== 200) throw new SmartSeoulApiError(`테마 목록 HTTP ${response.status} (분류 ${themeType})`);
      const parsed = parseJson(response.text);
      const body = parsed?.["body"];
      if (!parsed || (body !== undefined && body !== null && !Array.isArray(body))) {
        throw new SmartSeoulApiError(`테마 목록 응답 형식 오류 (분류 ${themeType})`);
      }
      const rows = (Array.isArray(body) ? body : []).filter(isRecord);
      items.push(...rows);
      const pageCount = readPageCount(parsed);
      if (rows.length === 0 || (pageCount !== null && page >= pageCount)) break;
    }
  }
  return items;
}

/** 시민에게 공개된 테마(THM_THEME_STAT = "1")만, ID가 겹치면 처음 것만(D-004). */
export function publicThemes(items: readonly Readonly<Record<string, unknown>>[]): PublicTheme[] {
  const seen = new Map<string, PublicTheme>();
  for (const item of items) {
    const id = String(item["THM_THEME_ID"] ?? "");
    if (id === "" || String(item["THM_THEME_STAT"] ?? "") !== "1" || seen.has(id)) continue;
    seen.set(id, { id, name: String(item["THM_THEME_NAME"] ?? "").trim(), type: String(item["THM_THEME_TYPE"] ?? "") });
  }
  return [...seen.values()];
}

/**
 * 테마 하나의 콘텐츠 전체. 페이지 정보가 어긋나면 받은 행을 버리고 incomplete로 알린다(design 2.2):
 * 페이지마다 전체 건수·페이지 수가 다르거나, 페이지 번호가 다르거나, 중간 페이지가 비었거나,
 * 받은 행 수가 전체 건수와 다르거나, 페이지 정보 없이 꽉 찬 페이지가 오면.
 */
export async function fetchThemeContents(get: HttpGet, key: string, themeId: string): Promise<ContentsResult> {
  const rows: ContentRow[] = [];
  let expected: { readonly total: number | null; readonly pageCount: number | null } | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE_URL}/${encodeURIComponent(key)}/public/themes/contents/ko?${query({
      page_size: PAGE_SIZE,
      page_no: page,
      coord_x: SEARCH_CENTER.lng,
      coord_y: SEARCH_CENTER.lat,
      distance: 1000,
      search_type: 1,
      search_name: "",
      theme_id: themeId,
      content_id: "",
      subcate_id: "",
    })}`;
    const response = await get(url);
    const parsed = parseJson(response.text);
    const code = parsed ? readResultCode(parsed) : null;
    if (response.status === 400 && code === "400") return { status: "unavailable", reason: "인증키에 이 테마 권한이 없습니다" };
    if (response.status !== 200) return { status: "error", reason: `HTTP ${response.status}` };
    if (!parsed) return { status: "error", reason: "JSON이 아닌 응답" };
    const body = parsed["body"];
    const total = readCount(parsed, "TOTAL_COUNT");
    if (page === 1 && code === "100" && total === 0 && Array.isArray(body) && body.length === 0) return { status: "ok", rows: [] };
    if (code === null || !["", "0", "200"].includes(code)) return { status: "error", reason: `resultCode ${code ?? "없음"}` };
    if (!Array.isArray(body)) return { status: "error", reason: "body가 배열이 아님" };

    const pageCount = readPageCount(parsed);
    const pageNo = readCount(parsed, "PAGE_NO");
    if (expected === null) expected = { total, pageCount };
    else if ((total !== null && total !== expected.total) || (pageCount !== null && pageCount !== expected.pageCount)) {
      return { status: "incomplete", reason: `${page}페이지에서 전체 건수·페이지 수가 바뀌었습니다` };
    }
    if (pageNo !== null && pageNo !== page) return { status: "incomplete", reason: `${page}페이지를 요청했는데 ${pageNo}페이지가 왔습니다` };
    rows.push(...body.filter(isRecord));

    const lastPage = expected.pageCount;
    if (lastPage !== null) {
      if (page >= lastPage) break;
      if (body.length === 0) return { status: "incomplete", reason: `${page}페이지가 비어 있습니다` };
    } else if (body.length < PAGE_SIZE) {
      break;
    } else {
      return { status: "incomplete", reason: "페이지 정보가 없어 끝을 알 수 없습니다" };
    }
  }
  const total = expected?.total ?? null;
  if (total !== null && rows.length !== total) {
    return { status: "incomplete", reason: `받은 행 ${rows.length}건이 전체 건수 ${total}건과 다릅니다` };
  }
  return { status: "ok", rows };
}

function query(params: Readonly<Record<string, string | number>>): string {
  return Object.entries(params)
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`)
    .join("&");
}

function parseJson(text: string): Readonly<Record<string, unknown>> | null {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 응답 머리는 `header`(새 형식)와 `head`(옛 형식)가 함께 오거나 하나만 온다. */
function headerValue(response: Readonly<Record<string, unknown>>, name: string): unknown {
  for (const section of ["header", "head"]) {
    const header = response[section];
    if (isRecord(header) && header[name] !== undefined && header[name] !== null) return header[name];
  }
  return undefined;
}

function readResultCode(response: Readonly<Record<string, unknown>>): string | null {
  const code = headerValue(response, "resultCode") ?? headerValue(response, "RETCODE");
  return code === undefined ? null : String(code);
}

function readCount(response: Readonly<Record<string, unknown>>, name: string): number | null {
  const value = headerValue(response, name);
  if (value === undefined || value === "") return null;
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

/** PAGE_COUNT가 없으면 TOTAL_COUNT와 PAGE_SIZE로 계산한다. */
function readPageCount(response: Readonly<Record<string, unknown>>): number | null {
  const pageCount = readCount(response, "PAGE_COUNT");
  if (pageCount !== null) return Math.max(1, pageCount);
  const total = readCount(response, "TOTAL_COUNT");
  const size = readCount(response, "PAGE_SIZE");
  return total !== null && size ? Math.max(1, Math.ceil(total / size)) : null;
}
