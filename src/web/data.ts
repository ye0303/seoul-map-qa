import type { RunInfo, StoredResults, ThemeEntry, VersionEntry } from "../core/model/dataFiles.ts";
import type { Snapshot } from "../core/model/snapshot.ts";
import { DATA_BASE, RAW_BASE } from "./config.ts";

/** 파일이 없음(예: 권한 없는 테마의 버전 목록). */
export class NotFoundError extends Error {
  readonly name = "NotFoundError";
}

/** 태그가 없으면 지금 버전(같은 사이트의 data/), 있으면 그 태그 시점의 GitHub 파일. */
export function dataUrl(path: string, tag?: string): string {
  return tag ? `${RAW_BASE}/${tag}/data/${path}` : `${DATA_BASE}${path}`;
}

const cache = new Map<string, Promise<unknown>>();

/** 같은 파일은 한 번만 받는다. 실패하면 다음에 다시 받을 수 있게 지운다. */
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = cache.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = load();
  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}

async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(`네트워크 오류로 불러오지 못했습니다: ${url}`);
  }
  if (response.status === 404) throw new NotFoundError(`파일이 없습니다: ${url}`);
  if (!response.ok) throw new Error(`불러오지 못했습니다(HTTP ${response.status}): ${url}`);
  return response.text();
}

function loadJson<T>(path: string, tag?: string): Promise<T> {
  return cached(`${tag ?? "current"}|${path}`, async () => JSON.parse(await fetchText(dataUrl(path, tag))) as T);
}

export const loadRun = () => loadJson<RunInfo>("run.json");
export const loadThemes = () => loadJson<ThemeEntry[]>("themes.json");
export const loadResults = (themeId: string, tag?: string) => loadJson<StoredResults>(`results/${themeId}.json`, tag);

/** 버전 목록. 한 번도 받지 못한 테마는 파일이 없어 빈 목록이다. */
export async function loadVersions(themeId: string): Promise<VersionEntry[]> {
  try {
    return await loadJson<VersionEntry[]>(`versions/${themeId}.json`);
  } catch (error) {
    if (error instanceof NotFoundError) return [];
    throw error;
  }
}

/** 스냅샷(meta.json + 1만 행 조각들). */
export function loadSnapshot(themeId: string, tag?: string): Promise<Snapshot> {
  return cached(`${tag ?? "current"}|snapshot|${themeId}`, async () => {
    const meta = await loadJson<{ readonly columns: readonly string[]; readonly shards: number }>(`snapshots/${themeId}/meta.json`, tag);
    const shards = await Promise.all(
      Array.from({ length: meta.shards }, (_, index) => fetchText(dataUrl(`snapshots/${themeId}/rows-${String(index).padStart(3, "0")}.ndjson`, tag))),
    );
    const rows = shards.flatMap((text) => text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as unknown[]));
    return { columns: meta.columns, rows };
  });
}
