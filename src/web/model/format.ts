import type { FindingChangeCounts, RowChangeCounts } from "../../core/model/dataFiles.ts";

const KOREAN_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** ISO 시각 → 한국 시각 "2026-10-08 16:54". */
export function koreanDateTime(iso: string): string {
  const parts = Object.fromEntries(KOREAN_TIME.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts["year"]}-${parts["month"]}-${parts["day"]} ${parts["hour"]}:${parts["minute"]}`;
}

/** 실행 ID "2026-10-08T16:54" → "2026-10-08 16:54". */
export function runIdLabel(runId: string): string {
  return runId.replace("T", " ");
}

/** 태그 "snap-2026-10-08-1654" → "2026-10-08 16:54". 형식이 다르면 그대로. */
export function tagLabel(tag: string): string {
  const match = /^snap-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/.exec(tag);
  return match ? `${match[1]} ${match[2]}:${match[3]}` : tag;
}

/** "방금", "12분 전", "3시간 전", "5일 전". */
export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/** 표에 보일 값. 객체·배열은 JSON, 빈 값은 "(비어 있음)". */
export function displayValue(value: unknown): string {
  if (value === undefined) return "(열 없음)";
  if (value === null || value === "") return "(비어 있음)";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** "추가 1 · 삭제 0 · 변경 3". 수정일만 바뀐 행이 있으면 덧붙인다. */
export function rowChangeText(rows: RowChangeCounts): string {
  const parts = [`추가 ${formatNumber(rows.added)}`, `삭제 ${formatNumber(rows.removed)}`, `변경 ${formatNumber(rows.modified)}`];
  if (rows.datesOnly) parts.push(`수정일만 바뀜 ${formatNumber(rows.datesOnly)}`);
  return parts.join(" · ");
}

/** "신규 2 · 해결 1 · 등급 변경 0". */
export function findingChangeText(findings: FindingChangeCounts): string {
  return [`신규 ${formatNumber(findings.added)}`, `해결 ${formatNumber(findings.resolved)}`, `등급 변경 ${formatNumber(findings.severityChanged)}`].join(" · ");
}
