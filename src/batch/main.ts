// 배치 실행: `pnpm batch`. 인증키는 환경 변수 SMART_SEOUL_THEME_KEY(GitHub Actions Secrets, 로컬은 .env).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createDistrictIndex, type DistrictGeoJson } from "../core/geo/districtIndex.ts";
import { fetchDepartments } from "./departments.ts";
import { createHttpGet } from "./http.ts";
import { BatchAbortError, runBatch } from "./runBatch.ts";
import { createStore } from "./storage.ts";

const key = process.env["SMART_SEOUL_THEME_KEY"]?.trim();
if (!key) {
  console.error("환경 변수 SMART_SEOUL_THEME_KEY가 없습니다. GitHub에서는 저장소 Secrets에, 로컬에서는 .env에 넣어 주세요.");
  process.exit(1);
}
// GitHub는 Secrets 원문만 가린다. URL에 들어가는 인코딩된 키도 로그에서 가린다.
if (process.env["GITHUB_ACTIONS"] === "true") console.log(`::add-mask::${encodeURIComponent(key)}`);

const boundaries = JSON.parse(readFileSync(new URL("../../reference/seoulDistrictBoundaries.json", import.meta.url), "utf8")) as DistrictGeoJson;

try {
  const run = await runBatch({
    key,
    get: createHttpGet(),
    store: createStore(fileURLToPath(new URL("../../data", import.meta.url))),
    districts: createDistrictIndex(boundaries),
    departments: () => fetchDepartments(),
    log: (line) => console.log(line),
  });
  const { themes, findings } = run;
  console.log(
    `완료 ${run.runId}: 공개 테마 ${themes.public}개(완료 ${themes.ok}, 권한 없음 ${themes.unavailable}, 불완전 ${themes.incomplete}, 실패 ${themes.error}), ` +
      `${run.rows}행, 오류 ${findings.error}·의심 ${findings.suspect}·정보 ${findings.info}, ${run.durationSec}초`,
  );
} catch (error) {
  console.error(error instanceof BatchAbortError ? `안전장치로 멈춤: ${error.message}` : `배치 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
