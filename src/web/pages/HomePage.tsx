import { useState } from "react";

import type { RunInfo, ThemeEntry } from "../../core/model/dataFiles.ts";
import { Async, CountCells, CountHeaders, StatusBadge } from "../components/common.tsx";
import { loadRun, loadThemes } from "../data.ts";
import { findingChangeText, formatNumber, koreanDateTime, rowChangeText, runIdLabel, timeAgo } from "../model/format.ts";
import { departmentOf, searchThemes, STATUS_LABEL, summarizeDepartments, uncheckedThemes } from "../model/summary.ts";
import { href } from "../route.ts";
import { useAsync } from "../useAsync.ts";

const SEARCH_LIMIT = 30;

export function HomePage() {
  const state = useAsync(() => Promise.all([loadRun(), loadThemes()]), []);
  return <Async state={state}>{([run, themes]) => <HomeView run={run} themes={themes} now={new Date()} />}</Async>;
}

export function HomeView({ run, themes, now }: { readonly run: RunInfo; readonly themes: readonly ThemeEntry[]; readonly now: Date }) {
  const departments = summarizeDepartments(themes);
  const unchecked = uncheckedThemes(themes);
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
          <span className="card-note">확실히 잘못된 값</span>
        </div>
        <div className="card card-suspect">
          <span className="card-label">의심</span>
          <strong>{formatNumber(run.findings.suspect)}</strong>
          <span className="card-note">사람이 확인해야 하는 값</span>
        </div>
        <div className="card card-info">
          <span className="card-label">정보</span>
          <strong>{formatNumber(run.findings.info)}</strong>
          <span className="card-note">참고용</span>
        </div>
      </section>

      <section>
        <h2>직전 검사 대비</h2>
        <RunChanges run={run} />
      </section>

      <ThemeSearch themes={themes} />

      <section>
        <h2>담당 과별 현황</h2>
        <p className="hint">
          오류가 많은 과부터 보여 줍니다. 과 이름을 누르면 그 과가 맡은 테마를 봅니다. 테마 수가 ‘검사/전체’로 보이면 검사하지 못한 테마가 있다는 뜻입니다.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>담당 과</th>
                <th className="num">테마</th>
                <CountHeaders />
                <th className="num">신규</th>
                <th className="num">해결</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr key={department.name}>
                  <td>
                    <a href={href.department(department.name)}>{department.name}</a>
                  </td>
                  <td className="num">
                    {department.checked === department.themes ? formatNumber(department.themes) : `${formatNumber(department.checked)}/${formatNumber(department.themes)}`}
                  </td>
                  <CountCells counts={department.counts} />
                  <td className="num">{formatNumber(department.added)}</td>
                  <td className="num">{formatNumber(department.resolved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {unchecked.length > 0 && (
        <section>
          <h2>검사하지 못한 테마 {formatNumber(unchecked.length)}개</h2>
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
                {unchecked.map((entry) => (
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
        </section>
      )}
    </>
  );
}

function RunChanges({ run }: { readonly run: RunInfo }) {
  if (!run.previous) return <p>첫 검사라 비교할 이전 결과가 없습니다.</p>;
  if (!run.changes) return <p>{runIdLabel(run.previous.runId)} 검사와 비교할 수 있는 테마가 없습니다.</p>;
  const { changes } = run;
  return (
    <>
      <p>
        {runIdLabel(run.previous.runId)} 검사 이후 내용이 바뀐 테마 <strong>{formatNumber(changes.themesChanged)}개</strong>
      </p>
      <ul className="facts">
        <li>콘텐츠: {rowChangeText(changes.rows)}</li>
        <li>판정: {findingChangeText(changes.findings)}</li>
        {changes.rulesEffect && <li>규칙 변경으로 생긴 판정 변화: {findingChangeText(changes.rulesEffect)}</li>}
      </ul>
    </>
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
          {found.length > 0 && (
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
                  {found.slice(0, SEARCH_LIMIT).map((entry) => (
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
          )}
        </>
      )}
    </section>
  );
}
