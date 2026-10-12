import { useState } from "react";

import type { ThemeEntry, VersionEntry } from "../../core/model/dataFiles.ts";
import type { Finding } from "../../core/rules/types.ts";
import { Async, ContentName, Pager, SeverityBadge } from "../components/common.tsx";
import { loadResults, loadRun, loadSnapshot, loadThemes, loadVersions } from "../data.ts";
import { compareVersions, type RowRef, type VersionComparison } from "../model/compare.ts";
import { ruleTitle } from "../model/findings.ts";
import { displayValue, formatNumber, tagLabel } from "../model/format.ts";
import { href } from "../route.ts";
import { useAsync } from "../useAsync.ts";

const CHANGE_PAGE_SIZE = 50;

type DiffData = { readonly entry: ThemeEntry; readonly from: VersionEntry; readonly to: VersionEntry; readonly comparison: VersionComparison };

export function DiffPage({ themeId, from, to }: { readonly themeId: string; readonly from: string; readonly to: string }) {
  const state = useAsync(async (): Promise<DiffData> => {
    const [run, themes, versions] = await Promise.all([loadRun(), loadThemes(), loadVersions(themeId)]);
    const entry = themes.find((theme) => theme.id === themeId);
    const before = versions.find((version) => version.tag === from);
    const after = versions.find((version) => version.tag === to);
    if (!entry || !before || !after) throw new Error("이 테마에서 고른 버전을 찾을 수 없습니다.");
    // 이번 실행 태그의 파일은 지금 사이트의 data/와 같아 GitHub에서 받지 않는다.
    const source = (tag: string) => (tag === run.tag ? undefined : tag);
    const [beforeSnapshot, afterSnapshot, beforeResults, afterResults] = await Promise.all([
      loadSnapshot(themeId, source(before.tag)),
      loadSnapshot(themeId, source(after.tag)),
      loadResults(themeId, source(before.tag)),
      loadResults(themeId, source(after.tag)),
    ]);
    const comparison = compareVersions(
      { snapshot: beforeSnapshot, findings: beforeResults.findings },
      { snapshot: afterSnapshot, findings: afterResults.findings },
    );
    return { entry, from: before, to: after, comparison };
  }, [themeId, from, to]);
  return (
    <Async state={state} loadingText="두 버전을 받아 비교하는 중… (콘텐츠가 많으면 시간이 걸립니다)">
      {(data) => <DiffView {...data} />}
    </Async>
  );
}

export function DiffView({ entry, from, to, comparison }: DiffData) {
  const { added, removed, modified, timestampOnly, findings } = comparison;
  const unchanged = added.length + removed.length + modified.length === 0;
  return (
    <>
      <p className="crumbs">
        <a href={href.home()}>검사 현황</a> › <a href={href.theme(entry.id)}>{entry.name}</a> › <a href={href.theme(entry.id, "versions")}>버전 이력</a> › 비교
      </p>
      <h1>버전 비교</h1>
      <p className="lead">
        {entry.name}: 기준 <strong>{tagLabel(from.tag)}</strong> (콘텐츠 {formatNumber(from.rowCount)}건) → 비교 <strong>{tagLabel(to.tag)}</strong> (콘텐츠{" "}
        {formatNumber(to.rowCount)}건)
      </p>
      <ul className="facts">
        <li>
          콘텐츠: 추가 {formatNumber(added.length)} · 삭제 {formatNumber(removed.length)} · 변경 {formatNumber(modified.length)}
          {timestampOnly.length > 0 && ` · 수정일만 바뀜 ${formatNumber(timestampOnly.length)}`}
        </li>
        <li>
          판정: 신규 {formatNumber(findings.added.length)} · 해결 {formatNumber(findings.resolved.length)} · 등급 변경 {formatNumber(findings.severityChanged.length)}
        </li>
      </ul>
      {unchanged && <p>두 버전의 콘텐츠 내용이 같습니다{timestampOnly.length > 0 && "(수정일만 바뀐 행 제외)"}.</p>}

      {modified.length > 0 && <ModifiedRows rows={modified} />}
      {added.length > 0 && <RowList title="추가된 콘텐츠" rows={added} />}
      {removed.length > 0 && <RowList title="삭제된 콘텐츠" rows={removed} />}
      {timestampOnly.length > 0 && (
        <details>
          <summary>수정일만 바뀐 콘텐츠 {formatNumber(timestampOnly.length)}건 (내용은 같음)</summary>
          <RowList rows={timestampOnly} />
        </details>
      )}

      {findings.added.length > 0 && <FindingList title="새로 생긴 판정" findings={findings.added} />}
      {findings.resolved.length > 0 && <FindingList title="해결된 판정" findings={findings.resolved} />}
      {findings.severityChanged.length > 0 && (
        <FindingList title="등급이 바뀐 판정(비교 버전 기준)" findings={findings.severityChanged.map((change) => change.after)} />
      )}
    </>
  );
}

function ModifiedRows({ rows }: { readonly rows: VersionComparison["modified"] }) {
  const [page, setPage] = useState(0);
  return (
    <section>
      <h2>바뀐 콘텐츠 {formatNumber(rows.length)}건</h2>
      {rows.slice(page * CHANGE_PAGE_SIZE, (page + 1) * CHANGE_PAGE_SIZE).map((row) => (
        <div key={row.key} className="change">
          <h3>
            {row.name ?? <span className="muted">(이름 없음)</span>} <small>{row.key}</small>
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>항목</th>
                  <th>기준 버전</th>
                  <th>비교 버전</th>
                </tr>
              </thead>
              <tbody>
                {row.fields.map((field) => (
                  <tr key={field.column}>
                    <th scope="row">
                      {field.label}
                      <small>{field.column}</small>
                    </th>
                    <td className="value before">{displayValue(field.before)}</td>
                    <td className="value after">{displayValue(field.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <Pager page={page} pageSize={CHANGE_PAGE_SIZE} total={rows.length} onChange={setPage} />
    </section>
  );
}

function RowList({ title, rows }: { readonly title?: string; readonly rows: readonly RowRef[] }) {
  const [page, setPage] = useState(0);
  const pageSize = CHANGE_PAGE_SIZE * 2;
  return (
    <section>
      {title && (
        <h2>
          {title} {formatNumber(rows.length)}건
        </h2>
      )}
      <ul className="rows">
        {rows.slice(page * pageSize, (page + 1) * pageSize).map((row) => (
          <li key={row.key}>
            {row.name ?? <span className="muted">(이름 없음)</span>} <small>{row.key}</small>
          </li>
        ))}
      </ul>
      <Pager page={page} pageSize={pageSize} total={rows.length} onChange={setPage} />
    </section>
  );
}

function FindingList({ title, findings }: { readonly title: string; readonly findings: readonly Finding[] }) {
  const [page, setPage] = useState(0);
  return (
    <section>
      <h2>
        {title} {formatNumber(findings.length)}건
      </h2>
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
            {findings.slice(page * CHANGE_PAGE_SIZE, (page + 1) * CHANGE_PAGE_SIZE).map((finding, index) => (
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
      <Pager page={page} pageSize={CHANGE_PAGE_SIZE} total={findings.length} onChange={setPage} />
    </section>
  );
}
