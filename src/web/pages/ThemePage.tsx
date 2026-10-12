import { Fragment, useMemo, useState } from "react";

import { diffFindings } from "../../core/diff/findingDiff.ts";
import { columnLabel } from "../../core/labels/columns.ts";
import type { StoredResults, ThemeEntry, VersionEntry } from "../../core/model/dataFiles.ts";
import { runTag } from "../../core/model/run.ts";
import { THEME_RULE_SETS } from "../../core/rules/registry.ts";
import type { Finding, Severity } from "../../core/rules/types.ts";
import { StackedBar } from "../components/charts.tsx";
import { Async, ContentName, CountCells, CountHeaders, ErrorBox, Loading, Pager, SeverityBadge, StatusBadge } from "../components/common.tsx";
import { PAGE_SIZE } from "../config.ts";
import { loadResults, loadSnapshot, loadThemes, loadVersions } from "../data.ts";
import { createRowReader } from "../model/compare.ts";
import { countByRule, countBySeverity, filterFindings, NO_FILTER, ruleTitle, type FindingFilter, type RuleCount } from "../model/findings.ts";
import { displayValue, formatNumber, koreanDateTime, rowChangeText, runIdLabel, tagLabel } from "../model/format.ts";
import { departmentOf, findingChangeTotal, SEVERITY_LABEL, SEVERITY_ORDER } from "../model/summary.ts";
import { href, type ThemeTab } from "../route.ts";
import { useAsync } from "../useAsync.ts";

/** 직전 검사 대비 판정 변화. 신규 표시와 해결 목록에 쓴다. */
export type FindingChanges =
  | { readonly status: "unknown"; readonly reason: string }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ok";
      readonly since: string;
      readonly added: ReadonlySet<string>;
      readonly resolved: readonly Finding[];
      readonly severityChanged: number;
      /** 직전 판정과 규칙 버전이 달라 규칙 변경 영향도 섞여 있음. */
      readonly rulesChanged: boolean;
    };

type ThemeData = { readonly entry: ThemeEntry; readonly results: StoredResults | null; readonly versions: readonly VersionEntry[] };

export function ThemePage({ themeId, tab }: { readonly themeId: string; readonly tab: ThemeTab }) {
  const state = useAsync(async (): Promise<ThemeData | null> => {
    const entry = (await loadThemes()).find((theme) => theme.id === themeId);
    if (!entry) return null;
    // 한 번도 받지 못한 테마(권한 없음 등)는 결과 파일이 없다.
    if (entry.lastSuccessAt === null) return { entry, results: null, versions: [] };
    const [results, versions] = await Promise.all([loadResults(themeId), loadVersions(themeId)]);
    return { entry, results, versions };
  }, [themeId]);
  return <Async state={state}>{(data) => (data ? <LoadedTheme {...data} tab={tab} /> : <ErrorBox message="테마를 찾을 수 없습니다." />)}</Async>;
}

function LoadedTheme({ entry, results, versions, tab }: ThemeData & { readonly tab: ThemeTab }) {
  const changes = useFindingChanges(entry, results);
  return <ThemeView entry={entry} results={results} versions={versions} tab={tab} changes={changes} />;
}

function useFindingChanges(entry: ThemeEntry, results: StoredResults | null): FindingChanges {
  const change = entry.change;
  // 판정 변화가 없으면 직전 판정 파일을 받을 필요가 없다.
  const previousTag = results && change?.findings && findingChangeTotal(change) > 0 ? runTag(change.since) : null;
  const previous = useAsync(async () => (previousTag ? loadResults(entry.id, previousTag) : null), [entry.id, previousTag]);
  return useMemo((): FindingChanges => {
    if (!results || !change) return { status: "unknown", reason: "이번 검사에서 받지 못한 테마라 직전 검사 대비 변화를 알 수 없습니다." };
    if (!change.findings) return { status: "unknown", reason: "직전 판정이 없어 신규·해결을 비교하지 못했습니다." };
    if (!previousTag) return { status: "ok", since: change.since, added: new Set(), resolved: [], severityChanged: 0, rulesChanged: false };
    if (previous.status === "loading") return previous;
    if (previous.status === "error" || !previous.data) return { status: "error", message: previous.status === "error" ? previous.message : "직전 판정이 없습니다." };
    const diff = diffFindings(previous.data.findings, results.findings);
    return {
      status: "ok",
      since: change.since,
      added: new Set(diff.added.map((finding) => finding.fingerprint)),
      resolved: diff.resolved,
      severityChanged: diff.severityChanged.length,
      rulesChanged: previous.data.rulesetVersion !== results.rulesetVersion,
    };
  }, [results, change, previousTag, previous]);
}

export function ThemeView({
  entry,
  results,
  versions,
  tab,
  changes,
}: ThemeData & { readonly tab: ThemeTab; readonly changes: FindingChanges }) {
  const department = departmentOf(entry);
  const themeRules = THEME_RULE_SETS.find((set) => set.themeId === entry.id);
  return (
    <>
      <p className="crumbs">
        <a href={href.home()}>검사 현황</a> › <a href={href.department(department)}>{department}</a> › 테마
      </p>
      <h1>{entry.name}</h1>
      <p className="lead">
        <StatusBadge status={entry.status} /> {department}
        {entry.rowCount !== null && <> · 콘텐츠 {formatNumber(entry.rowCount)}건</>}
        {entry.lastSuccessAt && <> · 마지막으로 받은 시각 {koreanDateTime(entry.lastSuccessAt)}</>} · 테마 ID {entry.id}
      </p>
      {entry.status !== "ok" && (
        <p className="notice">
          {sentence(entry.statusReason ?? "이번 검사에서 받지 못했습니다")}{" "}
          {entry.lastSuccessAt ? "마지막으로 받은 결과를 보여 줍니다." : "한 번도 받지 못해 검사 결과가 없습니다."}
          {entry.status === "unavailable" && " 인증키에 이 테마 권한을 신청하면 다음 검사부터 결과가 나옵니다."}
        </p>
      )}
      {entry.departmentStale && <p className="hint">담당 부서는 이번 검사에서 받지 못해 이전 정보입니다.</p>}
      {themeRules && (
        <p className="hint">
          이 테마에는 전용 규칙이 있습니다(<a href={href.rules()}>규칙 안내</a>).
        </p>
      )}

      {results && (
        <>
          <nav className="tabs" aria-label="테마 화면">
            <a href={href.theme(entry.id)} aria-current={tab === "findings" ? "page" : undefined}>
              판정 목록 ({formatNumber(results.findings.length)})
            </a>
            <a href={href.theme(entry.id, "versions")} aria-current={tab === "versions" ? "page" : undefined}>
              버전 이력 ({formatNumber(versions.length)})
            </a>
          </nav>
          {tab === "findings" ? (
            <FindingsTab themeId={entry.id} rowCount={entry.rowCount ?? 0} findings={results.findings} changes={changes} />
          ) : (
            <VersionsTab themeId={entry.id} versions={versions} />
          )}
        </>
      )}
    </>
  );
}

function FindingsTab({
  themeId,
  rowCount,
  findings,
  changes,
}: {
  readonly themeId: string;
  readonly rowCount: number;
  readonly findings: readonly Finding[];
  readonly changes: FindingChanges;
}) {
  const [filter, setFilter] = useState<FindingFilter>(NO_FILTER);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const added = changes.status === "ok" ? changes.added : null;
  const filtered = useMemo(() => filterFindings(findings, filter, added), [findings, filter, added]);
  const severities = useMemo(() => countBySeverity(findings), [findings]);
  const rules = useMemo(() => countByRule(findings), [findings]);
  const update = (next: Partial<FindingFilter>) => {
    setFilter({ ...filter, ...next });
    setPage(0);
    setOpen(null);
  };
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (findings.length === 0) {
    return (
      <>
        <ChangeSummary changes={changes} />
        <p>판정이 없습니다. 검사 규칙에 걸린 값이 없습니다.</p>
        <ResolvedFindings changes={changes} />
      </>
    );
  }
  return (
    <>
      <ChangeSummary changes={changes} />
      <section className="overview" aria-label="판정 요약">
        <StackedBar
          label={`판정 ${findings.length}건`}
          segments={SEVERITY_ORDER.map((severity) => ({ key: severity, label: SEVERITY_LABEL[severity], value: severities[severity], tone: severity }))}
          selected={filter.severity === "all" ? null : filter.severity}
          onSelect={(key) => update({ severity: filter.severity === key ? "all" : (key as Severity) })}
        />
        <RuleBars rules={rules} selected={filter.ruleId} onSelect={(ruleId) => update({ ruleId: filter.ruleId === ruleId ? "" : ruleId })} />
      </section>
      <div className="filters">
        <label>
          등급
          <select value={filter.severity} onChange={(event) => update({ severity: event.target.value as Severity | "all" })}>
            <option value="all">전체 ({formatNumber(findings.length)})</option>
            {SEVERITY_ORDER.map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_LABEL[severity]} ({formatNumber(severities[severity])})
              </option>
            ))}
          </select>
        </label>
        <label>
          규칙
          <select value={filter.ruleId} onChange={(event) => update({ ruleId: event.target.value })}>
            <option value="">전체</option>
            {rules.map(({ ruleId, count }) => (
              <option key={ruleId} value={ruleId}>
                {ruleId} {ruleTitle(ruleId)} ({formatNumber(count)})
              </option>
            ))}
          </select>
        </label>
        <label>
          찾기
          <input type="search" placeholder="이름·ID·값" value={filter.query} onChange={(event) => update({ query: event.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={filter.onlyNew} disabled={!added || added.size === 0} onChange={(event) => update({ onlyNew: event.target.checked })} />
          신규만{added ? ` (${formatNumber(added.size)})` : ""}
        </label>
      </div>
      <p className="hint">
        {formatNumber(filtered.length)}건{filtered.length !== findings.length && ` / 전체 ${formatNumber(findings.length)}건`}. 오류 → 의심 → 정보 순입니다.
      </p>
      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="findings">
            <thead>
              <tr>
                <th>등급</th>
                <th>규칙</th>
                <th>콘텐츠</th>
                <th>내용</th>
                <th>현재 값</th>
                <th>제안 값</th>
                <th>
                  <span className="sr-only">원본</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((finding, index) => {
                const isOpen = open === finding.fingerprint;
                return (
                  <Fragment key={`${finding.fingerprint}|${index}`}>
                    <tr className={isOpen ? "open" : undefined}>
                      <td>
                        <SeverityBadge severity={finding.severity} />
                        {added?.has(finding.fingerprint) && <span className="badge badge-new">신규</span>}
                      </td>
                      <td>
                        {finding.ruleId}
                        <small>{ruleTitle(finding.ruleId)}</small>
                      </td>
                      <td>
                        <ContentName finding={finding} />
                      </td>
                      <td>{finding.message}</td>
                      <td>
                        {finding.value !== undefined && <span className="value">{finding.value}</span>}
                        {finding.field && <small>{columnLabel(finding.field)}</small>}
                      </td>
                      <td>{finding.suggestion !== undefined && <span className="value">{finding.suggestion}</span>}</td>
                      <td>
                        {finding.contsId !== null && (
                          <button type="button" className="link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : finding.fingerprint)}>
                            {isOpen ? "닫기" : "원본"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && finding.contsId !== null && (
                      <tr className="detail-row">
                        <td colSpan={7}>
                          <RowDetail themeId={themeId} rowKey={finding.contsId} field={finding.field} rowCount={rowCount} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onChange={(next) => {
          setPage(next);
          setOpen(null);
        }}
      />
      <ResolvedFindings changes={changes} />
    </>
  );
}

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

/** 규칙별 판정 수를 많은 순 막대로. 막대 안은 등급별 비율. 누르면 그 규칙만 거른다. */
function RuleBars({ rules, selected, onSelect }: { readonly rules: readonly RuleCount[]; readonly selected: string; readonly onSelect: (ruleId: string) => void }) {
  const sorted = [...rules].sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId, "en", { numeric: true }));
  const max = Math.max(1, ...rules.map((rule) => rule.count));
  return (
    <div className="rule-bars">
      <p className="hint">규칙별 (누르면 그 규칙 판정만 보기, 다시 누르면 전체)</p>
      <ul>
        {sorted.map((rule) => (
          <li key={rule.ruleId}>
            <button type="button" className={`rule-bar${selected === rule.ruleId ? " selected" : ""}`} aria-pressed={selected === rule.ruleId} onClick={() => onSelect(rule.ruleId)}>
              <span className="rule-name">
                <span className="rule-id">{rule.ruleId}</span> {ruleTitle(rule.ruleId)}
              </span>
              <span className="rule-track" aria-hidden="true">
                {SEVERITY_ORDER.filter((severity) => rule.counts[severity] > 0).map((severity) => (
                  <span key={severity} className={`seg tone-${severity}`} style={{ width: `${(rule.counts[severity] / max) * 100}%` }} />
                ))}
              </span>
              <span className="rule-count">{formatNumber(rule.count)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangeSummary({ changes }: { readonly changes: FindingChanges }) {
  if (changes.status === "loading") return <Loading text="직전 검사와 비교하는 중…" />;
  if (changes.status === "unknown") return <p className="hint">{changes.reason}</p>;
  if (changes.status === "error") return <p className="notice">직전 판정을 불러오지 못해 신규 표시를 할 수 없습니다. ({changes.message})</p>;
  return (
    <p className="hint">
      직전 검사({runIdLabel(changes.since)}) 대비 신규 {formatNumber(changes.added.size)}건 · 해결 {formatNumber(changes.resolved.length)}건 · 등급 변경{" "}
      {formatNumber(changes.severityChanged)}건{changes.rulesChanged && " (규칙이 바뀌어 규칙 변경 영향도 포함)"}
    </p>
  );
}

function ResolvedFindings({ changes }: { readonly changes: FindingChanges }) {
  if (changes.status !== "ok" || changes.resolved.length === 0) return null;
  return (
    <details className="resolved">
      <summary>직전 검사 이후 해결된 판정 {formatNumber(changes.resolved.length)}건</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>등급</th>
              <th>규칙</th>
              <th>콘텐츠</th>
              <th>내용</th>
            </tr>
          </thead>
          <tbody>
            {changes.resolved.map((finding, index) => (
              <tr key={`${finding.fingerprint}|${index}`}>
                <td>
                  <SeverityBadge severity={finding.severity} />
                </td>
                <td>
                  {finding.ruleId}
                  <small>{ruleTitle(finding.ruleId)}</small>
                </td>
                <td>
                  <ContentName finding={finding} />
                </td>
                <td>{finding.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** 판정이 가리키는 행의 원본(지금 버전 스냅샷). 처음 열 때 받는다. */
function RowDetail({ themeId, rowKey, field, rowCount }: { readonly themeId: string; readonly rowKey: string; readonly field?: string; readonly rowCount: number }) {
  const state = useAsync(() => loadSnapshot(themeId).then(createRowReader), [themeId]);
  const loadingText = rowCount > 5000 ? `원본을 불러오는 중… (콘텐츠 ${formatNumber(rowCount)}건이라 시간이 걸릴 수 있습니다)` : "원본을 불러오는 중…";
  return (
    <Async state={state} loadingText={loadingText}>
      {(read) => {
        const fields = read(rowKey);
        if (!fields) return <p>원본에서 이 행({rowKey})을 찾지 못했습니다.</p>;
        const visible = fields.filter((item) => item.column === field || (item.value !== null && item.value !== ""));
        return (
          <>
            <table className="kv">
              <tbody>
                {visible.map((item) => (
                  <tr key={item.column} className={item.column === field ? "hl" : undefined}>
                    <th scope="row">
                      {item.label}
                      <small>{item.column}</small>
                    </th>
                    <td className="value">{displayValue(item.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length < fields.length && <p className="hint">빈 항목 {formatNumber(fields.length - visible.length)}개는 숨겼습니다.</p>}
          </>
        );
      }}
    </Async>
  );
}

function VersionsTab({ themeId, versions }: { readonly themeId: string; readonly versions: readonly VersionEntry[] }) {
  const [from, setFrom] = useState(versions.at(-2)?.tag ?? "");
  const [to, setTo] = useState(versions.at(-1)?.tag ?? "");
  if (versions.length === 0) return <p>저장된 버전이 없습니다.</p>;
  const order = (tag: string) => versions.findIndex((version) => version.tag === tag);
  const [older, newer] = order(from) <= order(to) ? [from, to] : [to, from];
  return (
    <>
      <p className="hint">
        내용이 바뀐 검사마다 버전이 하나씩 쌓입니다. 이전 버전도 모두 남아 있습니다.
        {versions.length > 1 && " 기준과 비교할 버전을 하나씩 고르세요."}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {versions.length > 1 && (
                <>
                  <th>기준</th>
                  <th>비교</th>
                </>
              )}
              <th>버전</th>
              <th className="num">콘텐츠</th>
              <CountHeaders />
              <th>직전 버전 대비 행 변화</th>
            </tr>
          </thead>
          <tbody>
            {[...versions].reverse().map((version) => (
              <tr key={version.tag}>
                {versions.length > 1 && (
                  <>
                    <td>
                      <input type="radio" name="from" aria-label={`${tagLabel(version.tag)} 기준`} checked={from === version.tag} onChange={() => setFrom(version.tag)} />
                    </td>
                    <td>
                      <input type="radio" name="to" aria-label={`${tagLabel(version.tag)} 비교`} checked={to === version.tag} onChange={() => setTo(version.tag)} />
                    </td>
                  </>
                )}
                <td>{runIdLabel(version.version)}</td>
                <td className="num">{formatNumber(version.rowCount)}</td>
                <CountCells counts={version.counts} />
                <td>{version.rows ? rowChangeText(version.rows) : "첫 버전"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {versions.length === 1 ? (
        <p>버전이 하나뿐이라 비교할 수 없습니다. 내용이 바뀌면 새 버전이 생깁니다.</p>
      ) : from === to ? (
        <p className="hint">서로 다른 두 버전을 고르세요.</p>
      ) : (
        <p>
          <a className="button" href={href.diff(themeId, older, newer)}>
            {tagLabel(older)} → {tagLabel(newer)} 비교
          </a>
        </p>
      )}
    </>
  );
}
