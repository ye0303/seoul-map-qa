import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { fetchDepartments, toDepartment } from "../../src/batch/departments.ts";
import { createHttpGet } from "../../src/batch/http.ts";
import { createStore, toShards } from "../../src/batch/storage.ts";

describe("createHttpGet", () => {
  const noWait = { backoffMs: () => 0 };

  test("5xx는 다시 시도하고, 4xx는 그대로 돌려준다", async () => {
    const statuses = [503, 502, 200];
    let calls = 0;
    const get = createHttpGet({ ...noWait, fetch: async () => new Response("ok", { status: statuses[calls++]! }) });
    expect(await get("https://example.test/a")).toEqual({ status: 200, text: "ok" });
    expect(calls).toBe(3);

    calls = 0;
    const once = createHttpGet({ ...noWait, fetch: async () => (calls++, new Response("bad", { status: 400 })) });
    expect(await once("https://example.test/b")).toEqual({ status: 400, text: "bad" });
    expect(calls).toBe(1);
  });

  test("네트워크 오류가 계속되면 URL을 담지 않은 오류를 낸다", async () => {
    const get = createHttpGet({
      ...noWait,
      retries: 2,
      fetch: async () => {
        throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect"), { code: "ECONNRESET" }) });
      },
    });
    const error = await get("https://example.test/SECRET-KEY/x").catch((caught: unknown) => caught);
    expect(String(error)).toBe("Error: 네트워크 오류(ECONNRESET)");
  });
});

describe("담당 부서", () => {
  test.each([
    [{ THM_MNG_TYPE_01: "1", THM_MNG_TYPE_02: "", THM_MNG_TYPE_03: "관광정책과" }, "서울시 관광정책과"],
    [{ THM_MNG_TYPE_01: "2", THM_MNG_TYPE_02: "성북구", THM_MNG_TYPE_03: "문화체육과" }, "성북구 문화체육과"],
    [{ THM_MNG_TYPE_01: "0", THM_MNG_TYPE_02: "", THM_MNG_TYPE_03: "세이브더칠드런" }, "세이브더칠드런"],
    [{ THM_MNG_TYPE_01: "3", THM_MNG_TYPE_02: "한강사업본부", THM_MNG_TYPE_03: "" }, "한강사업본부"],
    [{ THM_MNG_TYPE_01: " ", THM_MNG_TYPE_02: "", THM_MNG_TYPE_03: "" }, null],
    [{}, null],
  ])("%j → %s", (item, label) => {
    expect(toDepartment(item).label).toBe(label);
  });

  test("갤러리 스크립트에서 키를 읽어 목록을 받는다", async () => {
    const requests: { url: string; body: string }[] = [];
    const fake = (async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), body: String(init?.body ?? "") });
      if (String(url).endsWith("index.js")) return new Response('var dataString = "&cmd=x&key=0123456789abcdef0123456789abcdef&sort=0";');
      return Response.json({ body: [{ THM_THEME_ID: "t1", THM_MNG_TYPE_01: "1", THM_MNG_TYPE_03: "관광정책과" }] });
    }) as typeof fetch;
    const departments = await fetchDepartments(fake);
    expect(departments.get("t1")?.label).toBe("서울시 관광정책과");
    expect(requests[1]!.body).toContain("key=0123456789abcdef0123456789abcdef");
  });

  test("키를 찾지 못하면 오류", async () => {
    const fake = (async () => new Response("no key here")) as typeof fetch;
    await expect(fetchDepartments(fake)).rejects.toThrow("키를 찾지 못했습니다");
  });
});

describe("스냅샷 파일", () => {
  test("행을 정해진 수씩 NDJSON으로 나눈다", () => {
    expect(toShards([[1], [2], [3]], 2)).toEqual(["[1]\n[2]\n", "[3]\n"]);
    expect(toShards([])).toEqual([]);
  });

  test("테마가 줄어 파일 수가 줄면 남는 조각을 지운다", () => {
    const dir = mkdtempSync(join(tmpdir(), "seoul-map-qa-"));
    const store = createStore(dir);
    const results = { themeId: "t1", rulesetVersion: 1, contentHash: "h", findings: [] };
    store.writeTheme("t1", { meta: {}, shards: ["a\n", "b\n", "c\n"], results });
    store.writeTheme("t1", { meta: {}, shards: ["a\n"], results });
    expect(readdirSync(join(dir, "snapshots", "t1")).sort()).toEqual(["meta.json", "rows-000.ndjson"]);
  });
});
