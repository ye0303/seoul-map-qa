import type { RunInfo, ThemeEntry, VersionEntry } from "../../src/core/model/dataFiles.ts";
import type { Finding } from "../../src/core/rules/types.ts";

export function theme(id: string, overrides: Partial<ThemeEntry> = {}): ThemeEntry {
  return {
    id,
    name: `테마 ${id}`,
    type: "2",
    status: "ok",
    rowCount: 10,
    contentHash: `hash-${id}`,
    counts: { error: 0, suspect: 0, info: 0 },
    lastSuccessAt: "2026-10-08T07:54:25.828Z",
    department: { label: "서울시 공원여가정책과", codes: ["1", "", "공원여가정책과"] },
    change: { since: "2026-10-08T14:58", rows: { added: 0, removed: 0, modified: 0 }, findings: { added: 0, resolved: 0, severityChanged: 0 } },
    ...overrides,
  };
}

export function finding(ruleId: string, contsId: string | null, overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId,
    severity: "error",
    contsId,
    message: `${ruleId} ${contsId ?? "테마"}`,
    fingerprint: `${ruleId}|t|${contsId ?? ""}||`,
    ...overrides,
  };
}

export function version(runId: string, overrides: Partial<VersionEntry> = {}): VersionEntry {
  return {
    version: runId,
    tag: `snap-${runId.replace("T", "-").replace(":", "")}`,
    rowCount: 10,
    contentHash: `hash-${runId}`,
    counts: { error: 1, suspect: 2, info: 0 },
    rows: null,
    ...overrides,
  };
}

export const RUN: RunInfo = {
  runId: "2026-10-08T16:54",
  startedAt: "2026-10-08T07:54:25.828Z",
  finishedAt: "2026-10-08T07:56:47.143Z",
  durationSec: 141,
  rulesetVersion: 1,
  themes: { public: 3, ok: 2, unavailable: 1, incomplete: 0, error: 0, missing: 0 },
  rows: 226974,
  findings: { error: 573, suspect: 23087, info: 13570 },
  departments: "ok",
  tag: "snap-2026-10-08-1654",
  previous: { runId: "2026-10-08T14:58", tag: "snap-2026-10-08-1458" },
  changes: {
    themesChanged: 2,
    rows: { added: 0, removed: 0, modified: 1, datesOnly: 1154 },
    findings: { added: 3, resolved: 1, severityChanged: 0 },
  },
};
