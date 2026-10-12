import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { normalizeRows } from "../../src/core/model/snapshot.ts";
import { compareVersions } from "../../src/web/model/compare.ts";
import { DepartmentView } from "../../src/web/pages/DepartmentPage.tsx";
import { DiffView } from "../../src/web/pages/DiffPage.tsx";
import { HomeView } from "../../src/web/pages/HomePage.tsx";
import { RulesPage } from "../../src/web/pages/RulesPage.tsx";
import { ThemeView, type FindingChanges } from "../../src/web/pages/ThemePage.tsx";
import { finding, RUN, theme, version } from "./fixtures.ts";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const THEMES = [
  theme("100032", { name: "서울 미래유산", department: { label: "서울시 문화본부 문화정책과", codes: ["1", "", "문화본부 문화정책과"] }, counts: { error: 1, suspect: 3, info: 2 } }),
  theme("11102828", { name: "서울시 공공와이파이", counts: { error: 193, suspect: 2930, info: 1 } }),
  theme("999", {
    name: "구로구 복지지도",
    status: "unavailable",
    statusReason: "인증키에 이 테마 권한이 없습니다",
    department: { label: null, codes: ["", "", ""] },
    rowCount: null,
    contentHash: null,
    counts: null,
    lastSuccessAt: null,
    change: undefined,
  }),
];

describe("홈", () => {
  const since = "2026-10-08T14:58";
  const homeThemes = [
    THEMES[0]!,
    {
      ...THEMES[1]!,
      change: { since, rows: { added: 2, removed: 0, modified: 5, datesOnly: 1154 }, findings: { added: 3, resolved: 1, severityChanged: 0 } },
    },
    THEMES[2]!,
    theme("777", { name: "서울 둘레길", change: { since, rows: { added: 0, removed: 0, modified: 0, datesOnly: 12 }, findings: { added: 0, resolved: 0, severityChanged: 0 } } }),
  ];

  test("마지막 검사, 등급별 합계와 테마 수, 테마 상태 막대", () => {
    const page = text(renderToStaticMarkup(<HomeView run={RUN} themes={homeThemes} now={new Date("2026-10-08T11:00:00Z")} />));
    expect(page).toContain("마지막 검사 2026-10-08 16:56 (3시간 전)");
    expect(page).toContain("공개 테마 3개 중 2개 검사");
    expect(page).toContain("23,087 사람이 확인할 값 · 테마 2개");
    expect(page).toContain("테마 4개 한눈에");
    expect(page).toContain("오류 있음 2 의심만 0 정보만 0 문제 없음 1 검사 못함 1");
  });

  test("바뀐 테마는 카드로, 수정일만 바뀐 테마는 따로, 전체 합계는 한 줄로", () => {
    const html = renderToStaticMarkup(<HomeView run={RUN} themes={homeThemes} now={new Date("2026-10-08T11:00:00Z")} />);
    const page = text(html);
    expect(page).toContain("2026-10-08 14:58 검사 이후 바뀐 테마 1개");
    expect(page).toContain("전체 합계 — 콘텐츠: 추가 0 · 삭제 0 · 변경 1 · 수정일만 바뀜 1,154 · 판정: 신규 3 · 해결 1 · 등급 변경 0");
    expect(page).toContain("서울시 공공와이파이 서울시 공원여가정책과 콘텐츠 추가 2 · 삭제 0 · 변경 5 · 수정일만 바뀜 1,154 / 전체 10건 판정 신규 +3 해결 −1 버전 비교 →");
    expect(html).toContain('href="#/theme/11102828/versions"');
    expect(page).toContain("수정일만 바뀐 테마 1개 (내용은 같음)");
    expect(page).toContain("서울 둘레길 수정일만 12행");
  });

  test("담당 과 순위: 오류 많은 과부터, 담당 미상은 맨 뒤", () => {
    const page = text(renderToStaticMarkup(<HomeView run={RUN} themes={homeThemes} now={new Date()} />));
    expect(page).toContain("서울시 공원여가정책과 테마 2 · 정보 1 · 신규 +3 · 해결 −1 오류 193 의심 2,930");
    expect(page.indexOf("서울시 공원여가정책과 테마")).toBeLessThan(page.indexOf("서울시 문화본부 문화정책과 테마"));
    expect(page.indexOf("서울시 문화본부 문화정책과 테마")).toBeLessThan(page.indexOf("담당 미상 테마 0/1"));
    expect(page).not.toContain("전체 3개 보기"); // 10개 이하면 접지 않는다
  });

  test("첫 검사면 비교할 이전 결과가 없다고 알린다", () => {
    const page = text(renderToStaticMarkup(<HomeView run={{ ...RUN, previous: null, changes: null }} themes={THEMES} now={new Date()} />));
    expect(page).toContain("첫 검사라 비교할 이전 결과가 없습니다.");
  });
});

test("담당 과: 그 과의 테마만 오류 많은 순", () => {
  const themes = [...THEMES, theme("200", { name: "서울 공원", counts: { error: 7, suspect: 0, info: 0 } })];
  const page = text(renderToStaticMarkup(<DepartmentView department="서울시 공원여가정책과" themes={themes} />));
  expect(page).toContain("맡은 테마 2개");
  expect(page.indexOf("서울시 공공와이파이")).toBeLessThan(page.indexOf("서울 공원"));
  expect(page).not.toContain("서울 미래유산");
  expect(text(renderToStaticMarkup(<DepartmentView department="없는 과" themes={themes} />))).toContain("맡은 테마가 없습니다");
});

describe("테마", () => {
  const entry = THEMES[0]!;
  const findings = [
    finding("C-10", "11", { severity: "suspect", name: "경교장", field: "COT_TEL_NO", value: "2-123-4567", suggestion: "02-123-4567" }),
    finding("C-05", "12", { field: "COT_GU_NAME", value: "중구", suggestion: "종로구" }),
  ];
  const results = { themeId: entry.id, rulesetVersion: 1, contentHash: "h", findings };
  const versions = [version("2026-10-08T14:58"), version("2026-10-08T16:54", { rows: { added: 1, removed: 0, modified: 2, datesOnly: 5 } })];
  const changes: FindingChanges = {
    status: "ok",
    since: "2026-10-08T14:58",
    added: new Set([findings[1]!.fingerprint]),
    resolved: [finding("C-07", "13", { name: "딜쿠샤" })],
    severityChanged: 0,
    rulesChanged: false,
  };

  test("판정 목록: 오류부터, 신규 표시, 한글 항목 이름, 해결 목록", () => {
    const page = text(renderToStaticMarkup(<ThemeView entry={entry} results={results} versions={versions} tab="findings" changes={changes} />));
    expect(page).toContain("서울시 문화본부 문화정책과");
    expect(page).toContain("판정 목록 (2)");
    expect(page).toContain("버전 이력 (2)");
    expect(page).toContain("직전 검사(2026-10-08 14:58) 대비 신규 1건 · 해결 1건 · 등급 변경 0건");
    expect(page).toContain("오류 1 의심 1 정보 0");
    expect(page).toContain("C-05 구명과 좌표의 구 불일치 1");
    const table = text(renderToStaticMarkup(<ThemeView entry={entry} results={results} versions={versions} tab="findings" changes={changes} />).split('class="findings"')[1]!);
    expect(table.indexOf("C-05")).toBeLessThan(table.indexOf("C-10 전화번호 형식"));
    expect(page).toContain("오류 신규");
    expect(page).toContain("2-123-4567 전화번호");
    expect(page).toContain("02-123-4567");
    expect(page).toContain("직전 검사 이후 해결된 판정 1건");
    expect(page).toContain("딜쿠샤");
  });

  test("버전 이력: 최신부터, 행 변화, 비교 링크", () => {
    const html = renderToStaticMarkup(<ThemeView entry={entry} results={results} versions={versions} tab="versions" changes={changes} />);
    const page = text(html);
    expect(page.indexOf("2026-10-08 16:54")).toBeLessThan(page.indexOf("2026-10-08 14:58"));
    expect(page).toContain("추가 1 · 삭제 0 · 변경 2 · 수정일만 바뀜 5");
    expect(page).toContain("첫 버전");
    expect(html).toContain('href="#/theme/100032/diff/snap-2026-10-08-1458/snap-2026-10-08-1654"');
  });

  test("한 번도 받지 못한 테마는 사유만", () => {
    const page = text(renderToStaticMarkup(<ThemeView entry={THEMES[2]!} results={null} versions={[]} tab="findings" changes={{ status: "unknown", reason: "-" }} />));
    expect(page).toContain("인증키에 이 테마 권한이 없습니다. 한 번도 받지 못해 검사 결과가 없습니다. 인증키에 이 테마 권한을 신청하면");
    expect(page).toContain("담당 미상");
    expect(page).not.toContain("판정 목록");
  });
});

test("버전 비교: 바뀐 항목은 한글 이름과 전후 값, 수정일만 바뀐 행은 따로", () => {
  const before = normalizeRows([
    { COT_CONTS_ID: "1", COT_CONTS_NAME: "가", COT_TEL_NO: "02-1", COT_UPDATE_DATE: "1" },
    { COT_CONTS_ID: "2", COT_CONTS_NAME: "나", COT_TEL_NO: "02-2", COT_UPDATE_DATE: "1" },
  ]);
  const after = normalizeRows([
    { COT_CONTS_ID: "1", COT_CONTS_NAME: "가", COT_TEL_NO: "02-9", COT_UPDATE_DATE: "2" },
    { COT_CONTS_ID: "2", COT_CONTS_NAME: "나", COT_TEL_NO: "02-2", COT_UPDATE_DATE: "2" },
  ]);
  const comparison = compareVersions({ snapshot: before, findings: [] }, { snapshot: after, findings: [finding("C-10", "1", { name: "가" })] });
  const page = text(
    renderToStaticMarkup(<DiffView entry={THEMES[0]!} from={version("2026-10-08T14:58")} to={version("2026-10-08T16:54")} comparison={comparison} />),
  );
  expect(page).toContain("기준 2026-10-08 14:58");
  expect(page).toContain("추가 0 · 삭제 0 · 변경 1 · 수정일만 바뀜 1");
  expect(page).toContain("바뀐 콘텐츠 1건");
  expect(page).toContain("전화번호 COT_TEL_NO 02-1 02-9");
  expect(page).toContain("수정일만 바뀐 콘텐츠 1건");
  expect(page).toContain("새로 생긴 판정 1건");
});

test("규칙 안내: 공통 규칙과 테마 전용 규칙의 설명", () => {
  const page = text(renderToStaticMarkup(<RulesPage />));
  expect(page).toContain("C-01 좌표 없음");
  expect(page).toContain("서울에디션25 전용 규칙");
  expect(page).toContain("공통 규칙 C-12 대신");
  expect(page).toContain("T-E25-03");
});
