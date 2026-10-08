// data/ 파일 형식. 배치가 쓰고 화면이 읽는다.
import type { Finding } from "../rules/types.ts";

/** 테마 담당 부서(공개 갤러리 기준, D-048). */
export type Department = {
  /** 화면에 보일 담당: "서울시 관광정책과", "성북구 문화체육과", "세이브더칠드런" 등. 정보가 없으면 null. */
  readonly label: string | null;
  /** 갤러리 원본 값 THM_MNG_TYPE_01~03 (01: 1 서울시, 2 자치구, 0 외부 기관 등). */
  readonly codes: readonly [string, string, string];
};

export type ThemeStatus = "ok" | "unavailable" | "incomplete" | "error" | "missing";

export type FindingCounts = { readonly error: number; readonly suspect: number; readonly info: number };
/** 행 변화 수. datesOnly는 수정 시각만 바뀐 행(내용 변화가 아니라 modified에 넣지 않는다, D-056). M3 첫 실행 기록에는 없다. */
export type RowChangeCounts = { readonly added: number; readonly removed: number; readonly modified: number; readonly datesOnly?: number };
export type FindingChangeCounts = { readonly added: number; readonly resolved: number; readonly severityChanged: number };

/** 마지막으로 받은 상태 대비 이번 실행의 변화(D-025, D-043). */
export type ThemeChange = {
  /** 비교한 상태를 받은 실행 ID(보통 직전 실행). */
  readonly since: string;
  /** 행 변화. 내용이 바뀌었는데 이전 스냅샷을 읽지 못하면 null. */
  readonly rows: RowChangeCounts | null;
  /** 데이터가 바뀌어 생긴 판정 변화. 이전 판정이 없으면 null. */
  readonly findings: FindingChangeCounts | null;
  /** 규칙 버전이 바뀐 실행에서만: 같은 데이터에 새 규칙을 적용해 생긴 판정 변화. */
  readonly rulesEffect?: FindingChangeCounts;
};

/** data/versions/{테마ID}.json의 한 항목. 내용이 바뀐 실행마다 하나(D-018). */
export type VersionEntry = {
  /** 실행 ID. */
  readonly version: string;
  /** 그 실행 커밋의 git 태그. raw.githubusercontent.com/{owner}/{repo}/{tag}/data/… 로 그때 파일을 읽는다. */
  readonly tag: string;
  readonly rowCount: number;
  readonly contentHash: string;
  readonly counts: FindingCounts;
  /** 직전 버전 대비 행 변화. 첫 버전이면 null. */
  readonly rows: RowChangeCounts | null;
};

export type StoredResults = {
  readonly themeId: string;
  readonly rulesetVersion: number;
  readonly contentHash: string;
  readonly findings: readonly Finding[];
};

/** data/themes.json의 한 항목. 수집에 실패하면 행 수·해시·판정 수는 마지막 성공 값을 유지한다. */
export type ThemeEntry = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: ThemeStatus;
  readonly statusReason?: string;
  readonly rowCount: number | null;
  readonly contentHash: string | null;
  readonly counts: FindingCounts | null;
  readonly lastSuccessAt: string | null;
  readonly department: Department | null;
  /** 이번 실행에서 담당 부서를 받지 못해 이전 값을 쓴 경우. */
  readonly departmentStale?: true;
  /** 이번 실행에서 받은 테마만: 마지막으로 받은 상태 대비 변화. */
  readonly change?: ThemeChange;
};

export type RunInfo = {
  /** 한국 시각 "2026-10-08T15:30". 버전 이름에 쓴다. */
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationSec: number;
  readonly rulesetVersion: number;
  readonly themes: Readonly<Record<"public" | ThemeStatus, number>>;
  readonly rows: number;
  readonly findings: FindingCounts;
  readonly departments: "ok" | "stale";
  /** 이 실행 커밋에 붙이는 git 태그. */
  readonly tag: string;
  /** 직전 실행. 첫 실행이면 null. */
  readonly previous: { readonly runId: string; readonly tag: string } | null;
  /** 이번 실행에서 비교한 테마들의 변화 합계. 비교한 테마가 없으면 null. */
  readonly changes: {
    readonly themesChanged: number;
    readonly rows: RowChangeCounts;
    readonly findings: FindingChangeCounts;
    readonly rulesEffect?: FindingChangeCounts;
  } | null;
};

/** 이전 실행 정보. M2 실행(태그 도입 전)에는 tag가 없다. */
export type PreviousRun = { readonly runId: string; readonly tag?: string };
