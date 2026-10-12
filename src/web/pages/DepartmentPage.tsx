import type { ThemeEntry } from "../../core/model/dataFiles.ts";
import { Async, CountCells, CountHeaders, StatusBadge } from "../components/common.tsx";
import { loadThemes } from "../data.ts";
import { formatNumber } from "../model/format.ts";
import { departmentOf, sortThemes } from "../model/summary.ts";
import { href } from "../route.ts";
import { useAsync } from "../useAsync.ts";

export function DepartmentPage({ department }: { readonly department: string }) {
  const state = useAsync(() => loadThemes(), []);
  return <Async state={state}>{(themes) => <DepartmentView department={department} themes={themes} />}</Async>;
}

export function DepartmentView({ department, themes }: { readonly department: string; readonly themes: readonly ThemeEntry[] }) {
  const owned = sortThemes(themes.filter((entry) => departmentOf(entry) === department));
  return (
    <>
      <p className="crumbs">
        <a href={href.home()}>검사 현황</a> › 담당 과
      </p>
      <h1>{department}</h1>
      {owned.length === 0 ? (
        <p>이 담당 과가 맡은 테마가 없습니다.</p>
      ) : (
        <>
          <p className="lead">맡은 테마 {formatNumber(owned.length)}개. 오류가 많은 테마부터 보여 줍니다.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>테마</th>
                  <th className="num">콘텐츠</th>
                  <CountHeaders />
                  <th className="num">신규</th>
                  <th className="num">해결</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {owned.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <a href={href.theme(entry.id)}>{entry.name}</a>
                    </td>
                    <td className="num">{entry.rowCount === null ? "-" : formatNumber(entry.rowCount)}</td>
                    <CountCells counts={entry.counts} />
                    <td className="num">{entry.change?.findings ? formatNumber(entry.change.findings.added) : "-"}</td>
                    <td className="num">{entry.change?.findings ? formatNumber(entry.change.findings.resolved) : "-"}</td>
                    <td>
                      <StatusBadge status={entry.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
