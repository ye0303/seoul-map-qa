import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, test } from "vitest";

import type { HttpGet } from "../../src/core/api/smartSeoulApi.ts";
import { normalizeRows } from "../../src/core/model/snapshot.ts";
import { compareWithPrevious, runTag } from "../../src/batch/history.ts";
import { runBatch } from "../../src/batch/runBatch.ts";
import { createStore, type RunInfo, type ThemeEntry, type VersionEntry } from "../../src/batch/storage.ts";
import { check, districts, row } from "../helpers.ts";

type Rows = Record<string, unknown>[];

/** 테마별 콘텐츠를 바꿔 가며 여러 번 실행할 수 있는 가짜 API. "broken"이면 페이지 정보가 어긋난다. */
function api(themes: Record<string, Rows | "broken">): HttpGet {
  return async (url) => {
    const param = (name: string) => decodeURIComponent(new RegExp(`[?&]${name}=([^&]*)`).exec(url)?.[1] ?? "");
    if (url.includes("/public/themes/ko?")) {
      const body = param("theme_type") === "2" ? Object.keys(themes).map((id) => ({ THM_THEME_ID: id, THM_THEME_NAME: id, THM_THEME_STAT: "1", THM_THEME_TYPE: "2" })) : [];
      return { status: 200, text: JSON.stringify({ header: { resultCode: "200", TOTAL_COUNT: String(body.length), PAGE_COUNT: "1" }, body }) };
    }
    const contents = themes[param("theme_id")]!;
    if (contents === "broken") return { status: 200, text: JSON.stringify({ header: { resultCode: "200", TOTAL_COUNT: "3", PAGE_COUNT: "1" }, body: [] }) };
    return { status: 200, text: JSON.stringify({ header: { resultCode: "200", TOTAL_COUNT: String(contents.length), PAGE_COUNT: "1" }, body: contents }) };
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "seoul-map-qa-"));
});

const at = (iso: string) => () => new Date(iso);
async function run(themes: Record<string, Rows | "broken">, iso: string): Promise<RunInfo> {
  return runBatch({ key: "KEY", get: api(themes), store: createStore(dir), districts, departments: async () => new Map(), now: at(iso) });
}
const json = <T>(path: string): T => JSON.parse(readFileSync(join(dir, path), "utf8")) as T;
const entry = (id: string) => json<ThemeEntry[]>("themes.json").find((item) => item.id === id)!;

const t1 = [row({ COT_CONTS_ID: "a" }), row({ COT_CONTS_ID: "b", COT_CONTS_NAME: "덕수궁", COT_COORD_X: 126.9752, COT_COORD_Y: 37.5658, COT_TEL_NO: "02-350-5233%7E5244" })];
const t1Fixed = [
  row({ COT_CONTS_ID: "a", COT_CONTS_NAME: "서울특별시청" }),
  row({ COT_CONTS_ID: "b", COT_CONTS_NAME: "덕수궁", COT_COORD_X: 126.9752, COT_COORD_Y: 37.5658, COT_TEL_NO: "02-350-5233" }),
  row({ COT_CONTS_ID: "c", COT_CONTS_NAME: "세종문화회관", COT_COORD_X: 126.9762, COT_COORD_Y: 37.5726 }),
];
const others = Object.fromEntries(["t2", "t3", "t4"].map((id) => [id, [row({ COT_CONTS_ID: `${id}-1`, COT_CONTS_NAME: id })]]));

describe("버전과 직전 실행 대비 변화", () => {
  test("첫 실행: 테마마다 첫 버전 1개, 비교 결과는 없다", async () => {
    const first = await run({ t1, ...others }, "2026-10-08T04:30:00Z");
    expect(first).toMatchObject({ runId: "2026-10-08T13:30", tag: "snap-2026-10-08-1330", previous: null, changes: null });
    expect(json<VersionEntry[]>("versions/t1.json")).toEqual([
      { version: "2026-10-08T13:30", tag: "snap-2026-10-08-1330", rowCount: 2, contentHash: entry("t1").contentHash, counts: entry("t1").counts, rows: null },
    ]);
    expect(entry("t1")).not.toHaveProperty("change");
  });

  test("같은 데이터로 다시 돌리면 버전은 그대로이고 변화는 0", async () => {
    await run({ t1, ...others }, "2026-10-08T04:30:00Z");
    const versions = readFileSync(join(dir, "versions/t1.json"), "utf8");
    const second = await run({ t1, ...others }, "2026-10-09T01:00:00Z");
    expect(readFileSync(join(dir, "versions/t1.json"), "utf8")).toBe(versions);
    expect(entry("t1").change).toEqual({ since: "2026-10-08T13:30", rows: { added: 0, removed: 0, modified: 0 }, findings: { added: 0, resolved: 0, severityChanged: 0 } });
    expect(second.previous).toEqual({ runId: "2026-10-08T13:30", tag: "snap-2026-10-08-1330" });
    expect(second.changes).toMatchObject({ themesChanged: 0, rows: { added: 0, removed: 0, modified: 0 } });
  });

  test("내용이 바뀌면 새 버전을 붙이고 행·판정 변화를 센다", async () => {
    await run({ t1, ...others }, "2026-10-08T04:30:00Z");
    const second = await run({ t1: t1Fixed, ...others }, "2026-10-09T01:00:00Z");
    const versions = json<VersionEntry[]>("versions/t1.json");
    expect(versions.map((version) => [version.version, version.tag, version.rows])).toEqual([
      ["2026-10-08T13:30", "snap-2026-10-08-1330", null],
      ["2026-10-09T10:00", "snap-2026-10-09-1000", { added: 1, removed: 0, modified: 2 }],
    ]);
    // 전화번호를 고쳐 C-10 오류가 해결됐다
    expect(entry("t1").change?.findings).toMatchObject({ resolved: 1 });
    expect(second.changes).toMatchObject({ themesChanged: 1, rows: { added: 1, removed: 0, modified: 2 } });
    expect(json<VersionEntry[]>("versions/t2.json")).toHaveLength(1);
  });

  test("버전 기록이 없는 M2 데이터는 마지막으로 받은 실행을 첫 버전으로 삼는다", async () => {
    await run({ t1, ...others }, "2026-10-08T05:58:47Z");
    // M2 실행 결과처럼 만든다: 버전 목록·태그가 없다
    rmSync(join(dir, "versions"), { recursive: true });
    const { tag: _tag, previous: _previous, changes: _changes, ...m2Run } = json<RunInfo>("run.json");
    writeFileSync(join(dir, "run.json"), JSON.stringify(m2Run));

    const next = await run({ t1: t1Fixed, ...others }, "2026-10-09T01:00:00Z");
    expect(next.previous).toEqual({ runId: "2026-10-08T14:58", tag: "snap-2026-10-08-1458" });
    expect(json<VersionEntry[]>("versions/t1.json").map((version) => version.tag)).toEqual(["snap-2026-10-08-1458", "snap-2026-10-09-1000"]);
    expect(json<VersionEntry[]>("versions/t2.json").map((version) => version.tag)).toEqual(["snap-2026-10-08-1458"]);
  });

  test("직전 실행에서 못 받은 테마는 마지막으로 받은 실행과 비교한다", async () => {
    await run({ t1, ...others }, "2026-10-08T04:30:00Z");
    await run({ t1: "broken", ...others }, "2026-10-09T01:00:00Z");
    expect(entry("t1")).toMatchObject({ status: "incomplete" });
    expect(entry("t1")).not.toHaveProperty("change");
    await run({ t1: t1Fixed, ...others }, "2026-10-10T01:00:00Z");
    expect(entry("t1").change?.since).toBe("2026-10-08T13:30");
    expect(json<VersionEntry[]>("versions/t1.json").map((version) => version.version)).toEqual(["2026-10-08T13:30", "2026-10-10T10:00"]);
  });
});

test("규칙 버전이 바뀐 실행은 같은 데이터를 새 규칙으로 다시 검사해 규칙 영향과 데이터 변화를 나눈다", () => {
  const store = createStore(dir);
  const rows = [row({ COT_CONTS_ID: "a", COT_TEL_NO: "28159575" })];
  const snapshot = normalizeRows(rows);
  // 직전 실행: 옛 규칙(버전 0)이 남긴 판정은 지금 규칙에는 없는 가짜 판정 하나뿐이었다고 가정
  const oldFinding = { ruleId: "X-01", severity: "info" as const, contsId: "a", message: "옛 규칙", fingerprint: "X-01|t|a||" };
  store.writeTheme("t", {
    meta: { themeId: "t", columns: snapshot.columns, rowCount: 1, contentHash: "h", shards: 1 },
    shards: [snapshot.rows.map((values) => `${JSON.stringify(values)}${String.fromCharCode(10)}`).join("")],
    results: { themeId: "t", rulesetVersion: 0, contentHash: "h", findings: [oldFinding] },
  });
  const before: ThemeEntry = { id: "t", name: "t", type: "2", status: "ok", rowCount: 1, contentHash: "h", counts: { error: 0, suspect: 0, info: 1 }, lastSuccessAt: "2026-10-08T04:30:00Z", department: null };
  const findings = check(rows, "t");
  let rechecked = 0;
  const history = compareWithPrevious(store, "t", before, { runId: "2026-10-09T10:00", snapshot, contentHash: "h", counts: { error: 0, suspect: 1, info: 0 }, findings }, (previousRows) => {
    rechecked++;
    return check(previousRows, "t");
  });
  expect(rechecked).toBe(1);
  // 데이터는 그대로라 데이터 변화는 0, 판정 차이는 모두 규칙 영향이다
  expect(history.change).toMatchObject({ rows: { added: 0, removed: 0, modified: 0 }, findings: { added: 0, resolved: 0 }, rulesEffect: { added: findings.length, resolved: 1 } });
  expect(history.versions?.map((version) => version.tag)).toEqual([runTag("2026-10-08T13:30")]);
});
