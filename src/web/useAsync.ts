import { useEffect, useState } from "react";

export type AsyncState<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ok"; readonly data: T };

/** 비동기 불러오기. deps가 바뀌면 다시 불러오고, 화면을 떠나면 결과를 버린다. */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    load().then(
      (data) => alive && setState({ status: "ok", data }),
      (error: unknown) => alive && setState({ status: "error", message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      alive = false;
    };
  }, deps);
  return state;
}
