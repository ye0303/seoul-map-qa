import { fetchThemeContents, fetchThemeList, publicThemes, type ContentsResult, type HttpGet, type PublicTheme } from "../core/api/smartSeoulApi.ts";
import type { DistrictIndex } from "../core/geo/districtIndex.ts";
import type { ContentRow } from "../core/model/row.ts";
import { compareCodeUnits, contentHash, normalizeRows } from "../core/model/snapshot.ts";
import { RULESET_VERSION } from "../core/rules/registry.ts";
import { runRules } from "../core/rules/runRules.ts";
import type { Finding } from "../core/rules/types.ts";
import type { Department } from "./departments.ts";
import { describeError } from "./http.ts";
import { toShards, type FindingCounts, type RunInfo, type Store, type ThemeEntry, type ThemeFiles, type ThemeStatus } from "./storage.ts";

/** 공개 테마 수가 직전 실행보다 이 비율 넘게 줄면 API 장애로 보고 멈춘다(D-027). */
export const MAX_THEME_DROP = 0.2;
/** 수집에 실패한(error·incomplete) 테마가 이 비율을 넘으면 멈춘다. 권한 없음(unavailable)은 세지 않는다. */
export const MAX_FAILURE_RATIO = 0.3;

const CONCURRENCY = 4;

export type BatchOptions = {
  readonly key: string;
  readonly get: HttpGet;
  readonly store: Store;
  readonly districts: DistrictIndex;
  readonly departments: () => Promise<ReadonlyMap<string, Department>>;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
};

/** 안전장치에 걸려 아무것도 쓰지 않고 멈춤. */
export class BatchAbortError extends Error {
  readonly name = "BatchAbortError";
}

type Outcome = {
  readonly theme: PublicTheme;
  readonly result: Exclude<ContentsResult, { status: "ok" }> | { readonly status: "ok" };
  readonly done?: { readonly rowCount: number; readonly contentHash: string; readonly counts: FindingCounts; readonly files: ThemeFiles };
};

/** 공개 테마 전체를 수집·검사해 data/에 쓴다. 안전장치에 걸리면 쓰기 전에 멈춘다. */
export async function runBatch(options: BatchOptions): Promise<RunInfo> {
  const { key, get, store, districts } = options;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => {});
  const startedAt = now();

  const previous = new Map((store.readThemes() ?? []).map((entry) => [entry.id, entry]));
  const themes = publicThemes(await fetchThemeList(get, key));
  const previousPublic = [...previous.values()].filter((entry) => entry.status !== "missing").length;
  if (previousPublic > 0 && themes.length < previousPublic * (1 - MAX_THEME_DROP)) {
    throw new BatchAbortError(`공개 테마가 ${previousPublic}개에서 ${themes.length}개로 줄었습니다. API 장애일 수 있어 멈춥니다.`);
  }
  log(`공개 테마 ${themes.length}개`);

  let departments: ReadonlyMap<string, Department> | null = null;
  try {
    departments = await options.departments();
  } catch (error) {
    log(`담당 부서 정보를 받지 못해 이전 값을 씁니다(${error instanceof Error ? error.message : describeError(error)})`);
  }

  let finished = 0;
  const outcomes = await mapPool(themes, CONCURRENCY, async (theme): Promise<Outcome> => {
    let result = await fetchThemeContents(get, key, theme.id);
    if (result.status === "incomplete") result = await fetchThemeContents(get, key, theme.id);
    const outcome = result.status === "ok" ? inspect(theme, result.rows, districts) : { theme, result };
    finished++;
    log(`[${String(finished).padStart(3)}/${themes.length}] ${statusLabel(outcome.result.status)} ${theme.name}${progressDetail(outcome)}`);
    return outcome;
  });

  const failed = outcomes.filter((outcome) => outcome.result.status === "error" || outcome.result.status === "incomplete");
  if (themes.length > 0 && failed.length / themes.length > MAX_FAILURE_RATIO) {
    throw new BatchAbortError(`수집 실패 테마가 ${themes.length}개 중 ${failed.length}개입니다. 멈춥니다.`);
  }

  for (const outcome of outcomes) if (outcome.done) store.writeTheme(outcome.theme.id, outcome.done.files);

  const startedIso = startedAt.toISOString();
  const entries: ThemeEntry[] = outcomes.map(({ theme, result, done }) => {
    const before = previous.get(theme.id);
    const department = departments ? (departments.get(theme.id) ?? null) : (before?.department ?? null);
    return {
      id: theme.id,
      name: theme.name,
      type: theme.type,
      status: result.status,
      ...("reason" in result ? { statusReason: result.reason } : {}),
      rowCount: done?.rowCount ?? before?.rowCount ?? null,
      contentHash: done?.contentHash ?? before?.contentHash ?? null,
      counts: done?.counts ?? before?.counts ?? null,
      lastSuccessAt: done ? startedIso : (before?.lastSuccessAt ?? null),
      department,
      ...(departments ? {} : { departmentStale: true as const }),
    };
  });
  const listed = new Set(themes.map((theme) => theme.id));
  for (const entry of previous.values()) {
    if (listed.has(entry.id)) continue;
    const { statusReason: _reason, ...kept } = entry;
    entries.push({ ...kept, status: "missing", statusReason: "공개 테마 목록에 없습니다" });
  }
  entries.sort((a, b) => compareCodeUnits(a.id, b.id));
  store.writeThemes(entries);

  const finishedAt = now();
  const run: RunInfo = {
    runId: koreanMinute(startedAt),
    startedAt: startedIso,
    finishedAt: finishedAt.toISOString(),
    durationSec: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
    rulesetVersion: RULESET_VERSION,
    themes: { public: themes.length, ...countStatuses(entries) },
    rows: outcomes.reduce((sum, outcome) => sum + (outcome.done?.rowCount ?? 0), 0),
    findings: sumCounts(outcomes.flatMap((outcome) => (outcome.done ? [outcome.done.counts] : []))),
    departments: departments ? "ok" : "stale",
  };
  store.writeRun(run);
  return run;
}

/** 검사하고 저장할 문자열까지 만들어 원본 행은 바로 버린다(전체 원본을 메모리에 쌓지 않는다). */
function inspect(theme: PublicTheme, rows: readonly ContentRow[], districts: DistrictIndex): Outcome {
  const snapshot = normalizeRows(rows);
  const hash = contentHash(snapshot);
  const findings = runRules({ meta: theme, rows }, { districts });
  const shards = toShards(snapshot.rows);
  return {
    theme,
    result: { status: "ok" },
    done: {
      rowCount: rows.length,
      contentHash: hash,
      counts: countFindings(findings),
      files: {
        meta: { themeId: theme.id, columns: snapshot.columns, rowCount: rows.length, contentHash: hash, shards: shards.length },
        shards,
        results: { themeId: theme.id, rulesetVersion: RULESET_VERSION, contentHash: hash, findings },
      },
    },
  };
}

/** 순서를 지키며 최대 limit개씩 동시에 실행한다. */
async function mapPool<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function countStatuses(entries: readonly ThemeEntry[]): Record<ThemeStatus, number> {
  const counts: Record<ThemeStatus, number> = { ok: 0, unavailable: 0, incomplete: 0, error: 0, missing: 0 };
  for (const entry of entries) counts[entry.status]++;
  return counts;
}

function countFindings(findings: readonly Finding[]): FindingCounts {
  const counts = { error: 0, suspect: 0, info: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

function sumCounts(list: readonly FindingCounts[]): FindingCounts {
  return list.reduce((sum, counts) => ({ error: sum.error + counts.error, suspect: sum.suspect + counts.suspect, info: sum.info + counts.info }), { error: 0, suspect: 0, info: 0 });
}

function statusLabel(status: ThemeStatus): string {
  return { ok: "완료", unavailable: "권한 없음", incomplete: "불완전", error: "실패", missing: "목록 없음" }[status];
}

function progressDetail(outcome: Outcome): string {
  if (outcome.done) return ` (${outcome.done.rowCount}행, 오류 ${outcome.done.counts.error}·의심 ${outcome.done.counts.suspect})`;
  return "reason" in outcome.result ? ` — ${outcome.result.reason}` : "";
}

/** 한국 시각 기준 "YYYY-MM-DDTHH:mm". */
export function koreanMinute(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}`;
}
