import { describe, expect, test } from "vitest";

import edition25 from "../../fixtures/edition25.json" with { type: "json" };
import mineralSprings from "../../fixtures/mineral-springs.json" with { type: "json" };
import nightViews from "../../fixtures/night-views.json" with { type: "json" };
import { runRules } from "../../../src/core/rules/runRules.ts";
import { districts } from "../../helpers.ts";

// 2026-10-08에 받은 실제 공개 테마 원본. 규칙을 바꾸면 차이를 검토한 뒤 `vitest -u`로 갱신한다.
const fixtures = { edition25, "mineral-springs": mineralSprings, "night-views": nightViews };

describe.each(Object.entries(fixtures))("%s", (name, fixture) => {
  const findings = runRules({ meta: fixture.meta, rows: fixture.rows }, { districts });

  test("판정 결과가 승인된 결과와 같다", async () => {
    await expect(`${JSON.stringify(findings, null, 1)}\n`).toMatchFileSnapshot(`../../golden/${name}.findings.json`);
  });

  test("행 순서가 바뀌어도 결과가 같다", () => {
    expect(runRules({ meta: fixture.meta, rows: [...fixture.rows].reverse() }, { districts })).toEqual(findings);
  });
});
