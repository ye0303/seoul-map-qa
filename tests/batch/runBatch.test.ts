import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, test } from "vitest";

import type { HttpGet } from "../../src/core/api/smartSeoulApi.ts";
import type { Department } from "../../src/batch/departments.ts";
import { koreanMinute } from "../../src/batch/history.ts";
import { BatchAbortError, runBatch } from "../../src/batch/runBatch.ts";
import { createStore, type RunInfo, type ThemeEntry } from "../../src/batch/storage.ts";
import { districts, row } from "../helpers.ts";

const KEY = "SECRET/KEY+1";

type FakeTheme = { id: string; name: string; contents: "unavailable" | "broken" | Record<string, unknown>[] };

/** 테마 목록·콘텐츠 API를 흉내 내는 GET. 테마별 콘텐츠 요청 수를 센다. */
function fakeApi(themes: FakeTheme[]) {
  const contentRequests = new Map<string, number>();
  const get: HttpGet = async (url) => {
    const param = (name: string) => decodeURIComponent(new RegExp(`[?&]${name}=([^&]*)`).exec(url)?.[1] ?? "");
    if (url.includes("/public/themes/ko?")) {
      const body = param("theme_type") === "2" ? themes.map((theme) => ({ THM_THEME_ID: theme.id, THM_THEME_NAME: theme.name, THM_THEME_STAT: "1", THM_THEME_TYPE: "2" })) : [];
      return { status: 200, text: JSON.stringify({ header: { resultCode: "200", TOTAL_COUNT: String(body.length), PAGE_COUNT: "1" }, body }) };
    }
    const id = param("theme_id");
    contentRequests.set(id, (contentRequests.get(id) ?? 0) + 1);
    const theme = themes.find((candidate) => candidate.id === id)!;
    if (theme.contents === "unavailable") return { status: 400, text: JSON.stringify({ header: { resultCode: "400" } }) };
    if (theme.contents === "broken") return { status: 200, text: JSON.stringify({ header: { resultCode: "200", TOTAL_COUNT: "5", PAGE_COUNT: "1" }, body: [] }) };
    return { status: 200, text: JSON.stringify({ header: { resultCode: "200", TOTAL_COUNT: String(theme.contents.length), PAGE_COUNT: "1" }, body: theme.contents }) };
  };
  return { get, contentRequests };
}

const department = (label: string): Department => ({ label, codes: ["1", "", label] });

let dir: string;
let logs: string[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "seoul-map-qa-"));
  logs = [];
});

async function run(themes: FakeTheme[], options: { departments?: () => Promise<ReadonlyMap<string, Department>>; at?: string } = {}) {
  const api = fakeApi(themes);
  const result = await runBatch({
    key: KEY,
    get: api.get,
    store: createStore(dir),
    districts,
    departments: options.departments ?? (async () => new Map([["t1", department("서울시 관광정책과")]])),
    now: () => new Date(options.at ?? "2026-10-08T04:30:00Z"),
    log: (line) => logs.push(line),
  });
  return { result, api };
}

const read = (path: string) => readFileSync(join(dir, path), "utf8");
const themesJson = () => JSON.parse(read("themes.json")) as ThemeEntry[];

const base: FakeTheme[] = [
  { id: "t1", name: "테마1", contents: [row({ COT_CONTS_ID: "a" }), row({ COT_CONTS_ID: "b", COT_CONTS_NAME: "덕수궁", COT_COORD_X: 126.9752, COT_COORD_Y: 37.5658, COT_TEL_NO: "02-350-5233%7E5244" })] },
  { id: "t2", name: "테마2", contents: [row({ COT_CONTS_ID: "c" })] },
  { id: "t3", name: "권한 없는 테마", contents: "unavailable" },
];
/** 실패율 안전장치(30%)에 걸리지 않게 정상 테마를 더한다. */
const fillers: FakeTheme[] = ["f1", "f2", "f3"].map((id) => ({ id, name: id, contents: [row({ COT_CONTS_ID: id })] }));

describe("runBatch", () => {
  test("공개 테마를 수집·검사해 실행 정보, 테마 목록, 스냅샷, 판정 결과를 쓴다", async () => {
    const { result } = await run(base);
    expect(result).toMatchObject({
      runId: "2026-10-08T13:30",
      themes: { public: 3, ok: 2, unavailable: 1, incomplete: 0, error: 0, missing: 0 },
      rows: 3,
      findings: { error: 1 },
      departments: "ok",
    });
    expect(JSON.parse(read("run.json"))).toEqual(result);
    expect(themesJson()).toMatchObject([
      { id: "t1", status: "ok", rowCount: 2, counts: { error: 1 }, lastSuccessAt: "2026-10-08T04:30:00.000Z", department: { label: "서울시 관광정책과" } },
      { id: "t2", status: "ok", rowCount: 1, department: null },
      { id: "t3", status: "unavailable", statusReason: "인증키에 이 테마 권한이 없습니다", rowCount: null, lastSuccessAt: null },
    ]);
    const meta = JSON.parse(read("snapshots/t1/meta.json"));
    expect(meta).toMatchObject({ themeId: "t1", rowCount: 2, shards: 1 });
    expect(read("snapshots/t1/rows-000.ndjson").trimEnd().split("\n")).toHaveLength(2);
    expect(JSON.parse(read("results/t1.json"))).toMatchObject({ themeId: "t1", contentHash: meta.contentHash, findings: [{ ruleId: "C-10", contsId: "b" }] });
  });

  test("내용이 같으면 다시 돌려도 스냅샷·판정 파일이 바이트 단위로 같다", async () => {
    await run(base);
    const before = ["snapshots/t1/meta.json", "snapshots/t1/rows-000.ndjson", "results/t1.json"].map(read);
    await run(base, { at: "2026-10-09T01:00:00Z" });
    expect(["snapshots/t1/meta.json", "snapshots/t1/rows-000.ndjson", "results/t1.json"].map(read)).toEqual(before);
    expect(themesJson()[0]!.lastSuccessAt).toBe("2026-10-09T01:00:00.000Z");
  });

  test("수집에 실패한 테마는 이전 파일과 마지막 성공 시각을 유지한다", async () => {
    await run(base);
    const snapshot = read("snapshots/t2/rows-000.ndjson");
    await run([base[0]!, { ...base[1]!, contents: "broken" }, base[2]!, ...fillers], { at: "2026-10-09T01:00:00Z" });
    expect(read("snapshots/t2/rows-000.ndjson")).toBe(snapshot);
    expect(themesJson().find((entry) => entry.id === "t2")).toMatchObject({ status: "incomplete", rowCount: 1, lastSuccessAt: "2026-10-08T04:30:00.000Z" });
  });

  test("페이지 정보가 어긋나면 한 번 다시 받는다", async () => {
    const { api } = await run([...base.slice(0, 2), { id: "t4", name: "깨진 테마", contents: "broken" }, ...fillers]);
    expect(api.contentRequests.get("t4")).toBe(2);
    expect(api.contentRequests.get("t1")).toBe(1);
  });

  test("목록에서 빠진 테마는 missing으로 남긴다", async () => {
    await run(base);
    await run([base[0]!, base[1]!, { id: "t5", name: "새 테마", contents: [row({ COT_CONTS_ID: "e" })] }], { at: "2026-10-09T01:00:00Z" });
    expect(themesJson().find((entry) => entry.id === "t3")).toMatchObject({ status: "missing", statusReason: "공개 테마 목록에 없습니다" });
  });

  test("담당 부서를 받지 못하면 이전 값을 쓰고 표시해 둔다", async () => {
    await run(base);
    const { result } = await run(base, {
      departments: async () => {
        throw new Error("갤러리 HTTP 503");
      },
    });
    expect(result.departments).toBe("stale");
    expect(themesJson()[0]).toMatchObject({ department: { label: "서울시 관광정책과" }, departmentStale: true });
  });

  test("인증키는 로그와 어떤 파일에도 남지 않는다", async () => {
    await run(base);
    const files = listFiles(dir).map((path) => readFileSync(path, "utf8"));
    for (const text of [...files, ...logs]) {
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(encodeURIComponent(KEY));
    }
  });
});

describe("안전장치: 쓰기 전에 멈춘다", () => {
  const many = (count: number): FakeTheme[] => Array.from({ length: count }, (_, index) => ({ id: `m${index}`, name: `테마${index}`, contents: [row({ COT_CONTS_ID: `r${index}` })] }));

  test("공개 테마가 직전보다 20% 넘게 줄면", async () => {
    await run(many(10));
    const before = read("themes.json");
    await expect(run(many(7))).rejects.toBeInstanceOf(BatchAbortError);
    expect(read("themes.json")).toBe(before);
  });

  test("수집 실패 테마가 30%를 넘으면", async () => {
    const themes = many(10).map((theme, index) => (index < 4 ? { ...theme, contents: "broken" as const } : theme));
    await expect(run(themes)).rejects.toBeInstanceOf(BatchAbortError);
    expect(() => statSync(join(dir, "themes.json"))).toThrow();
  });

  test("공개 테마가 0개로 오면", async () => {
    await expect(run([])).rejects.toBeInstanceOf(BatchAbortError);
    expect(() => statSync(join(dir, "run.json"))).toThrow();
  });

  test("권한 없음(unavailable)은 실패로 세지 않는다", async () => {
    const themes = many(10).map((theme, index) => (index < 5 ? { ...theme, contents: "unavailable" as const } : theme));
    const { result } = await run(themes);
    expect(result.themes).toMatchObject({ ok: 5, unavailable: 5 });
  });
});

test("koreanMinute은 한국 시각 분 단위", () => {
  expect(koreanMinute(new Date("2026-10-08T15:05:59Z"))).toBe("2026-10-09T00:05");
});

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(root, entry.name)) : [join(root, entry.name)],
  );
}

export type { RunInfo };
