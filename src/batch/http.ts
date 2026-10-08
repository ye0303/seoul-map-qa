import type { HttpGet } from "../core/api/smartSeoulApi.ts";

export type HttpOptions = {
  readonly timeoutMs?: number;
  /** 네트워크 오류·5xx일 때 다시 시도하는 횟수. */
  readonly retries?: number;
  /** n번째 재시도 전 대기 시간(ms). 기본 1s, 4s, 16s. */
  readonly backoffMs?: (attempt: number) => number;
  readonly fetch?: typeof fetch;
};

/** fetch 기반 GET. 오류 메시지에 URL을 넣지 않는다(경로에 인증키가 있다). */
export function createHttpGet(options: HttpOptions = {}): HttpGet {
  const { timeoutMs = 30_000, retries = 3, backoffMs = (attempt) => 1000 * 4 ** attempt, fetch: fetchImpl = fetch } = options;
  return async (url) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
        const text = await response.text();
        if (response.status >= 500 && attempt < retries) {
          await delay(backoffMs(attempt));
          continue;
        }
        return { status: response.status, text };
      } catch (error) {
        if (attempt >= retries) throw new Error(`네트워크 오류(${describeError(error)})`);
        await delay(backoffMs(attempt));
      }
    }
  };
}

/** 오류 종류만 짧게. fetch 오류의 cause에는 주소가 들어갈 수 있어 코드·이름만 쓴다. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "알 수 없는 오류";
  const cause: unknown = error.cause;
  const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : null;
  return code ?? error.name;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
