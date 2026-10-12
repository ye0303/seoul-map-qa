import { useState } from "react";

import type { RunInfo, ThemeEntry } from "../../core/model/dataFiles.ts";
import { MiniBar, Meter, StackedBar } from "../components/charts.tsx";
import { Async, CountCells, CountHeaders, StatusBadge } from "../components/common.tsx";
import { loadRun, loadThemes } from "../data.ts";
import { findingChangeText, formatNumber, koreanDateTime, rowChangeText, runIdLabel, timeAgo } from "../model/format.ts";
import {
  changedThemes,
  departmentOf,
  groupByHealth,
  HEALTH_LABEL,
  HEALTH_ORDER,
  rowChangeTotal,
  searchThemes,
  STATUS_LABEL,
  summarizeDepartments,
  themesWithSeverity,
  type DepartmentSummary,
  type Health,
} from "../model/summary.ts";
import { href } from "../route.ts";
import { useAsync } from "../useAsync.ts";

const SEARCH_LIMIT = 30;
/** 담당 과 순위에서 처음 보여 줄 과 수. */
const TOP_DEPARTMENTS = 10;

export function HomePage() {
  const state = useAsync(() => Promise.all([loadRun(), loadThemes()]), []);
  return <Async state={state}>{([run, themes]) => <HomeView run={run} themes={themes} now={new Date()} />}</Async>;
}

export function HomeView({ run, themes, now }: { readonly run: RunInfo; readonly themes: readonly ThemeEntry[]; readonly now: Date }) {
  const withSeverity = themesWithSeverity(themes);
  return (
    <>
      <h1>검사 현황</h1>
      <p className="lead">
        마지막 검사 <strong>{koreanDateTime(run.finishedAt)}</strong> ({timeAgo(run.finishedAt, now)}) · 공개 테마 {formatNumber(run.themes.public)}개 중{" "}
        {formatNumber(run.themes.ok)}개 검사 · 콘텐츠 {formatNumber(run.rows)}건
      </p>
      {run.departments === "stale" && <p className="notice">이번 검사에서 담당 부서 정보를 받지 못해 이전 정보를 보여 줍니다.</p>}

      <section className="cards" aria-label="등급별 판정 수">
        <div className="card card-error">
          <span className="card-label">오류</span>
          <strong>{formatNumber(run.findings.error)}</strong>
          <span className="card-note">확실히 잘못된 값 · 테마 {formatNumber(withSeverity.error)}개</span>
        </div>
        <div className="card card-suspect">
          <span className="card-label">의심</span>
          <strong>{formatNumber(run.findings.suspect)}</strong>
          <span className="card-note">사람이 확인할 값 · 테마 {formatNumber(withSeverity.suspect)}개</span>
        </div>
        <div className="card card-info">
          <span className="card-label">정보</span>
          <strong>{formatNumber(run.findings.info)}</strong>
          <span className="card-note">참고용 · 테마 {formatNumber(withSeverity.info)}개</span>
        </div>
      </section>

      <ThemeHealth themes={themes} />
      <RunChanges run={run} themes={themes} />
      <ThemeSearch themes={themes} />
      <DepartmentRanking departments={summarizeDepartments(themes)} />
    </>
  );
}

/** 테마 전체를 가장 높은 등급별로 나눈 한 줄 막대. 항목을 누르면 그 테마 목록. */
function ThemeHealth({ themes }: { readonly themes: readonly ThemeEntry[] }) {
  const [selected, setSelected] = useState<Health | null>(null);
  const groups = groupByHealth(themes);
  const chosen = selected ? groups.get(selected)! : [];
  return (
    <section>
      <h2>테마 {formatNumber(themes.length)}개 한눈에</h2>
      <StackedBar
        label="테마 상태"
        segments={HEALTH_ORDER.map((health) => ({ key: health, label: HEALTH_LABEL[health], value: groups.get(health)!.length, tone: health }))}
        selected={selected}
        onSelect={(key) => setSelected(selected === key ? null : (key as Health))}
      />
      <p className="hint">항목을 누르면 그 테마 목록이 보입니다. 테마마다 가장 높은 등급으로 셉니다(오류와 의심이 함께 있으면 "오류 있음").</p>
      {selected && (
        <div className="drill">
          <h3>
            {HEALTH_LABEL[selected]} {formatNumber(chosen.length)}개
          </h3>
          {selected === "unchecked" ? <UncheckedList themes={chosen} /> : <ThemeTable themes={chosen} />}
        </div>
      )}
    </section>
  );
}

function ThemeTable({ themes }: { readonly themes: readonly ThemeEntry[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>테마</th>
            <th>담당 과</th>
            <CountHeaders />
          </tr>
        </thead>
        <tbody>
          {themes.map((entry) => (
            <tr key={entry.id}>
              <td>
                <a href={href.theme(entry.id)}>{entry.name}</a>
              </td>
              <td>{departmentOf(entry)}</td>
              <CountCells counts={entry.counts} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UncheckedList({ themes }: { readonly themes: readonly ThemeEntry[] }) {
  return (
    <>
      <p className="hint">인증키 권한이 없거나 받는 중 실패한 테마입니다. 권한을 신청하거나 다음 검사를 기다려 주세요.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>테마</th>
              <th>상태</th>
              <th>사유</th>
              <th>담당 과</th>
            </tr>
          </thead>
          <tbody>
            {themes.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <a href={href.theme(entry.id)}>{entry.name}</a>
                </td>
                <td>
                  <StatusBadge status={entry.status} />
                </td>
                <td>{entry.statusReason ?? STATUS_LABEL[entry.status]}</td>
                <td>{departmentOf(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 직전 검사 이후 바뀐 테마 카드. */
function RunChanges({ run, themes }: { readonly run: RunInfo; readonly themes: readonly ThemeEntry[] }) {
  if (!run.previous) {
    return (
      <section>
        <h2>직전 검사 대비</h2>
        <p>첫 검사라 비교할 이전 결과가 없습니다.</p>
      </section>
    );
  }
  const { changed, datesOnly } = changedThemes(themes);
  return (
    <section>
      <h2>
        {runIdLabel(run.previous.runId)} 검사 이후 바뀐 테마 {formatNumber(changed.length)}개
      </h2>
      {run.changes && (
        <p className="hint">
          전체 합계 — 콘텐츠: {rowChangeText(run.changes.rows)} · 판정: {findingChangeText(run.changes.findings)}
          {run.changes.rulesEffect && ` · 규칙 변경 영향: ${findingChangeText(run.changes.rulesEffect)}`}
        </p>
      )}
      {changed.length === 0 ? (
        <p>콘텐츠나 판정이 바뀐 테마가 없습니다.</p>
      ) : (
        <div className="change-cards">
          {changed.map((entry) => (
            <ChangeCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
      {datesOnly.length > 0 && (
        <details>
          <summary>수정일만 바뀐 테마 {formatNumber(datesOnly.length)}개 (내용은 같음)</summary>
          <ul className="chips">
            {datesOnly.map((entry) => (
              <li key={entry.id}>
                <a href={href.theme(entry.id)}>{entry.name}</a> <small>수정일만 {formatNumber(entry.change?.rows?.datesOnly ?? 0)}행</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ChangeCard({ entry }: { readonly entry: ThemeEntry }) {
  const change = entry.change!;
  const rows = change.rows;
  const changedRows = rows ? rowChangeTotal(rows) : null;
  const contentChanged = changedRows === null || changedRows > 0;
  return (
    <article className={`change-card${contentChanged ? "" : " findings-only"}`}>
      <h3>
        <a href={href.theme(entry.id)}>{entry.name}</a>
      </h3>
      <p className="card-dept">{departmentOf(entry)}</p>
      <div className="card-row">
        <span className="card-key">콘텐츠</span>
        {rows === null ? (
          <span>바뀜 (이전 버전을 읽지 못해 행 수는 모름)</span>
        ) : changedRows === 0 ? (
          <span className="muted">그대로{rows.datesOnly ? ` (수정일만 ${formatNumber(rows.datesOnly)}행)` : ""}</span>
        ) : (
          <span className="card-value">
            <MiniBar
              label={`전체 ${entry.rowCount ?? 0}건 중 ${changedRows}건 바뀜`}
              total={Math.max(entry.rowCount ?? 0, changedRows ?? 0)}
              parts={[
                { key: "added", label: "추가", value: rows.added, tone: "added" },
                { key: "removed", label: "삭제", value: rows.removed, tone: "removed" },
                { key: "modified", label: "변경", value: rows.modified, tone: "modified" },
              ]}
            />
            <span>
              {rowChangeText(rows)}
              {entry.rowCount !== null && <small> / 전체 {formatNumber(entry.rowCount)}건</small>}
            </span>
          </span>
        )}
      </div>
      <div className="card-row">
        <span className="card-key">판정</span>
        {change.findings ? (
          <span className="card-value inline">
            <span className={`delta${change.findings.added ? " delta-new" : ""}`}>신규 +{formatNumber(change.findings.added)}</span>
            <span className={`delta${change.findings.resolved ? " delta-resolved" : ""}`}>해결 −{formatNumber(change.findings.resolved)}</span>
            {change.findings.severityChanged > 0 && <span className="delta">등급 변경 {formatNumber(change.findings.severityChanged)}</span>}
            {change.rulesEffect && <small>규칙 변경 영향: {findingChangeText(change.rulesEffect)}</small>}
          </span>
        ) : (
          <span className="muted">직전 판정이 없어 비교하지 못함</span>
        )}
      </div>
      <a className="card-link" href={contentChanged ? href.theme(entry.id, "versions") : href.theme(entry.id)}>
        {contentChanged ? "버전 비교 →" : "판정 보기 →"}
      </a>
    </article>
  );
}

function ThemeSearch({ themes }: { readonly themes: readonly ThemeEntry[] }) {
  const [query, setQuery] = useState("");
  const found = searchThemes(themes, query);
  return (
    <section>
      <h2>
        <label htmlFor="theme-search">테마 찾기</label>
      </h2>
      <input
        id="theme-search"
        className="search"
        type="search"
        placeholder="테마 이름이나 담당 과(예: 공원, 문화정책과)"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.trim() && (
        <>
          <p className="hint">
            {found.length === 0 ? "찾는 테마가 없습니다." : `${formatNumber(found.length)}개${found.length > SEARCH_LIMIT ? ` 중 ${SEARCH_LIMIT}개만 보여 줍니다` : ""}`}
          </p>
          {found.length > 0 && <ThemeTable themes={found.slice(0, SEARCH_LIMIT)} />}
        </>
      )}
    </section>
  );
}

/** 담당 과를 오류 많은 순으로 막대 순위. 처음엔 상위 몇 개만. */
function DepartmentRanking({ departments }: { readonly departments: readonly DepartmentSummary[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? departments : departments.slice(0, TOP_DEPARTMENTS);
  const maxError = Math.max(1, ...departments.map((department) => department.counts.error));
  const maxSuspect = Math.max(1, ...departments.map((department) => department.counts.suspect));
  return (
    <section>
      <h2>담당 과 순위</h2>
      <p className="hint">오류가 많은 과부터 보여 줍니다. 과 이름을 누르면 그 과가 맡은 테마를 봅니다. 막대 길이는 가장 많은 과를 기준으로 합니다.</p>
      <div className="ranking">
        <div className="ranking-head" aria-hidden="true">
          <span>담당 과</span>
          <span>오류</span>
          <span>의심</span>
        </div>
        <ol>
          {shown.map((department) => (
            <li key={department.name}>
              <span className="rank-name">
                <a href={href.department(department.name)}>{department.name}</a>
                <small>
                  테마 {department.checked === department.themes ? formatNumber(department.themes) : `${formatNumber(department.checked)}/${formatNumber(department.themes)}`}
                  {department.counts.info > 0 && ` · 정보 ${formatNumber(department.counts.info)}`}
                  {department.added > 0 && ` · 신규 +${formatNumber(department.added)}`}
                  {department.resolved > 0 && ` · 해결 −${formatNumber(department.resolved)}`}
                </small>
              </span>
              <Meter label="오류" value={department.counts.error} max={maxError} tone="error" />
              <Meter label="의심" value={department.counts.suspect} max={maxSuspect} tone="suspect" />
            </li>
          ))}
        </ol>
      </div>
      {departments.length > TOP_DEPARTMENTS && (
        <p>
          <button type="button" onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? `상위 ${TOP_DEPARTMENTS}개만 보기` : `전체 ${formatNumber(departments.length)}개 보기`}
          </button>
        </p>
      )}
    </section>
  );
}
