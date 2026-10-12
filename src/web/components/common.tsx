import type { ReactNode } from "react";

import type { FindingCounts, ThemeStatus } from "../../core/model/dataFiles.ts";
import type { Finding, Severity } from "../../core/rules/types.ts";
import { formatNumber } from "../model/format.ts";
import { SEVERITY_LABEL, STATUS_LABEL } from "../model/summary.ts";
import type { AsyncState } from "../useAsync.ts";

export function Loading({ text = "불러오는 중…" }: { readonly text?: string }) {
  return (
    <p className="notice" role="status">
      {text}
    </p>
  );
}

export function ErrorBox({ message }: { readonly message: string }) {
  return (
    <p className="notice notice-error" role="alert">
      {message}
    </p>
  );
}

/** 불러오는 중·실패를 공통으로 보여 주고, 성공하면 children을 그린다. */
export function Async<T>({ state, children, loadingText }: { readonly state: AsyncState<T>; readonly children: (data: T) => ReactNode; readonly loadingText?: string }) {
  if (state.status === "loading") return <Loading text={loadingText} />;
  if (state.status === "error") return <ErrorBox message={state.message} />;
  return <>{children(state.data)}</>;
}

export function SeverityBadge({ severity }: { readonly severity: Severity }) {
  return <span className={`badge badge-${severity}`}>{SEVERITY_LABEL[severity]}</span>;
}

export function StatusBadge({ status }: { readonly status: ThemeStatus }) {
  return <span className={`badge ${status === "ok" ? "badge-ok" : "badge-warn"}`}>{STATUS_LABEL[status]}</span>;
}

/** 콘텐츠 이름과 ID. 이름이 없으면(이름 없는 행, 이름 기록 전 판정) ID만. */
export function ContentName({ finding }: { readonly finding: Finding }) {
  if (finding.contsId === null) return <>테마 전체{finding.groupKey && <small>{finding.groupKey}</small>}</>;
  if (!finding.name) return <>{finding.contsId}</>;
  return (
    <>
      {finding.name}
      <small>{finding.contsId}</small>
    </>
  );
}

/** 등급별 건수 칸 3개(오류·의심·정보). 값이 없으면 "-". */
export function CountCells({ counts }: { readonly counts: FindingCounts | null }) {
  return (
    <>
      <td className={`num${counts?.error ? " num-error" : ""}`}>{counts ? formatNumber(counts.error) : "-"}</td>
      <td className={`num${counts?.suspect ? " num-suspect" : ""}`}>{counts ? formatNumber(counts.suspect) : "-"}</td>
      <td className="num">{counts ? formatNumber(counts.info) : "-"}</td>
    </>
  );
}

export function CountHeaders() {
  return (
    <>
      <th className="num">오류</th>
      <th className="num">의심</th>
      <th className="num">정보</th>
    </>
  );
}

/** 표 쪽 넘기기. 한 쪽뿐이면 그리지 않는다. */
export function Pager({ page, pageSize, total, onChange }: { readonly page: number; readonly pageSize: number; readonly total: number; readonly onChange: (page: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <nav className="pager" aria-label="쪽 넘기기">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 0}>
        이전
      </button>
      <span>
        {formatNumber(first)}–{formatNumber(last)} / {formatNumber(total)}
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages - 1}>
        다음
      </button>
    </nav>
  );
}
