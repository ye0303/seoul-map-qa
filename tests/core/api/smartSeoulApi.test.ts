import { describe, expect, test } from "vitest";

import { fetchThemeContents, fetchThemeList, publicThemes, type HttpGet } from "../../../src/core/api/smartSeoulApi.ts";

type Page = { status?: number; header?: Record<string, unknown>; body?: unknown; text?: string };
type ParsedUrl = { path: string; params: Record<string, string> };

/** core는 URL 전역 객체 없이 타입 검사되므로 테스트도 직접 나눠 읽는다. */
function parseUrl(raw: string): ParsedUrl {
  const [base = "", search = ""] = raw.split("?");
  const params = Object.fromEntries(
    search.split("&").filter(Boolean).map((pair) => {
      const [name = "", value = ""] = pair.split("=");
      return [decodeURIComponent(name), decodeURIComponent(value)];
    }),
  );
  return { path: base.replace(/^https:\/\/[^/]+/, ""), params };
}

/** 요청 URL의 page_no로 응답을 고르는 가짜 GET. 요청 URL도 모아 둔다. */
function fakeGet(pages: (page: number, url: ParsedUrl) => Page) {
  const urls: string[] = [];
  const get: HttpGet = async (raw) => {
    urls.push(raw);
    const url = parseUrl(raw);
    const page = pages(Number(url.params["page_no"]), url);
    return { status: page.status ?? 200, text: page.text ?? JSON.stringify({ header: page.header, body: page.body }) };
  };
  return { get, urls };
}

const rows = (count: number, from = 0) => Array.from({ length: count }, (_, index) => ({ COT_CONTS_ID: `r${from + index}` }));

describe("fetchThemeContents", () => {
  test("모든 페이지를 받아 합친다", async () => {
    const { get, urls } = fakeGet((page) => ({
      header: { resultCode: "200", TOTAL_COUNT: "2500", PAGE_COUNT: "3", PAGE_NO: String(page) },
      body: rows(page < 3 ? 1000 : 500, (page - 1) * 1000),
    }));
    const result = await fetchThemeContents(get, "KEY/+", "1786321258890");
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.rows.length).toBe(2500);
    expect(urls).toHaveLength(3);
  });

  test("이름 검색·빈 검색어로 반경 없이 테마 전체를 요청하고 키를 인코딩한다", async () => {
    const { get, urls } = fakeGet(() => ({ header: { resultCode: "200", TOTAL_COUNT: "1", PAGE_COUNT: "1" }, body: rows(1) }));
    await fetchThemeContents(get, "KEY/+", "1786321258890");
    const url = parseUrl(urls[0]!);
    expect(url.path).toBe("/openapi/v5/KEY%2F%2B/public/themes/contents/ko");
    expect(url.params).toMatchObject({ search_type: "1", search_name: "", theme_id: "1786321258890", page_size: "1000", page_no: "1" });
  });

  test("빈 테마(resultCode 100, 0건)는 정상", async () => {
    const { get } = fakeGet(() => ({ header: { resultCode: "100", TOTAL_COUNT: 0 }, body: [] }));
    expect(await fetchThemeContents(get, "KEY", "t")).toEqual({ status: "ok", rows: [] });
  });

  test("권한 없는 테마(HTTP 400, resultCode 400)는 unavailable", async () => {
    const { get } = fakeGet(() => ({ status: 400, header: { resultCode: "400", resultMessage: "요청하신 테마는 허용하지 않습니다." } }));
    expect(await fetchThemeContents(get, "KEY", "t")).toMatchObject({ status: "unavailable" });
  });

  test.each<[string, (page: number) => Page]>([
    ["중간에 전체 건수가 바뀜", (page) => ({ header: { resultCode: "200", TOTAL_COUNT: page === 1 ? "1500" : "1400", PAGE_COUNT: "2" }, body: rows(page === 1 ? 1000 : 400) })],
    ["다른 페이지 번호가 옴", (page) => ({ header: { resultCode: "200", TOTAL_COUNT: "1500", PAGE_COUNT: "2", PAGE_NO: "1" }, body: rows(page === 1 ? 1000 : 500) })],
    ["중간 페이지가 비어 있음", (page) => ({ header: { resultCode: "200", TOTAL_COUNT: "2500", PAGE_COUNT: "3" }, body: page === 2 ? [] : rows(1000) })],
    ["받은 건수가 전체 건수와 다름", () => ({ header: { resultCode: "200", TOTAL_COUNT: "10", PAGE_COUNT: "1" }, body: rows(7) })],
    ["페이지 정보 없이 꽉 찬 페이지", () => ({ header: { resultCode: "200" }, body: rows(1000) })],
  ])("%s → incomplete", async (_, pages) => {
    const { get } = fakeGet(pages);
    expect(await fetchThemeContents(get, "KEY", "t")).toMatchObject({ status: "incomplete" });
  });

  test("뒷 페이지에 페이지 정보가 빠져도 첫 페이지 정보를 쓴다", async () => {
    const { get } = fakeGet((page) => ({ header: page === 1 ? { resultCode: "200", TOTAL_COUNT: "1500", PAGE_COUNT: "2" } : { resultCode: "200" }, body: rows(page === 1 ? 1000 : 500) }));
    expect((await fetchThemeContents(get, "KEY", "t")).status).toBe("ok");
  });

  test("페이지 정보가 없으면 TOTAL_COUNT·PAGE_SIZE로 페이지 수를 계산한다", async () => {
    const { get, urls } = fakeGet((page) => ({ header: { resultCode: "200", TOTAL_COUNT: "1200", PAGE_SIZE: "1000" }, body: rows(page === 1 ? 1000 : 200) }));
    expect((await fetchThemeContents(get, "KEY", "t")).status).toBe("ok");
    expect(urls).toHaveLength(2);
  });

  test.each<[string, Page]>([
    ["HTTP 500", { status: 500, text: "server error" }],
    ["JSON이 아님", { text: "<html>" }],
    ["실패 코드", { header: { resultCode: "300" }, body: [] }],
  ])("%s → error", async (_, page) => {
    const { get } = fakeGet(() => page);
    expect(await fetchThemeContents(get, "KEY", "t")).toMatchObject({ status: "error" });
  });

  test("옛 형식 머리(head.RETCODE)도 읽는다", async () => {
    const { get } = fakeGet(() => ({ text: JSON.stringify({ head: { RETCODE: "0", TOTAL_COUNT: "1", PAGE_COUNT: "1" }, body: rows(1) }) }));
    expect((await fetchThemeContents(get, "KEY", "t")).status).toBe("ok");
  });
});

describe("fetchThemeList · publicThemes", () => {
  test("분류마다 빈 페이지가 나올 때까지 받고, 공개 테마만 ID 중복 없이 고른다", async () => {
    const { get, urls } = fakeGet((page, url) => {
      const type = url.params["theme_type"];
      // 참여 테마(5)는 TOTAL_COUNT 1047인데 첫 페이지 뒤에 빈 페이지가 온다(실제 동작)
      if (type === "5") return { header: { resultCode: "200", TOTAL_COUNT: "1047", PAGE_COUNT: "2" }, body: page === 1 ? [{ THM_THEME_ID: "c1", THM_THEME_NAME: "참여", THM_THEME_STAT: "1", THM_THEME_TYPE: "5" }] : [] };
      if (type === "2") {
        return {
          header: { resultCode: "200", TOTAL_COUNT: "3", PAGE_COUNT: "1" },
          body: [
            { THM_THEME_ID: "a", THM_THEME_NAME: " 공개 ", THM_THEME_STAT: "1", THM_THEME_TYPE: "2" },
            { THM_THEME_ID: "b", THM_THEME_NAME: "중지", THM_THEME_STAT: "2", THM_THEME_TYPE: "2" },
            { THM_THEME_ID: "a", THM_THEME_NAME: "중복", THM_THEME_STAT: "1", THM_THEME_TYPE: "2" },
          ],
        };
      }
      return { header: { resultCode: "200", TOTAL_COUNT: "0", PAGE_COUNT: "0" }, body: [] };
    });
    const themes = publicThemes(await fetchThemeList(get, "KEY"));
    expect(themes).toEqual([
      { id: "a", name: "공개", type: "2" },
      { id: "c1", name: "참여", type: "5" },
    ]);
    expect(urls.map((raw) => parseUrl(raw).params["theme_type"])).toEqual(["1", "2", "4", "5", "5"]);
  });

  test("인증키가 거절되면 서버 안내 문구를 담은 오류를 낸다", async () => {
    const { get } = fakeGet(() => ({ status: 400, header: { resultCode: "400", resultMessage: "요청하신 APIKEY를 확인해 주세요(미발급, 미승인, 종료등)" } }));
    await expect(fetchThemeList(get, "WRONG-KEY")).rejects.toThrow("테마 목록 요청이 거절됐습니다(HTTP 400: 요청하신 APIKEY를 확인해 주세요(미발급, 미승인, 종료등))");
  });

  test("목록 요청이 실패하면 URL(키)을 담지 않은 오류를 낸다", async () => {
    const { get } = fakeGet(() => ({ status: 503, text: "" }));
    const error = await fetchThemeList(get, "SECRET-KEY").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain("SECRET-KEY");
  });
});
