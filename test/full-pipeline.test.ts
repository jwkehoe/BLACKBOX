import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTurnSection, countTurnSections, reportPathForSession } from "../lib/append-report.ts";
import { buildReportBody, type ReportInputs } from "../lib/build-report-body.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL - ${name}`);
    console.log(`         ${(err as Error).message}`);
  }
}

function withTempDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "full-pipeline-test-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sessionId = "021c85b1-0d54-40c6-a119-6bcb0382d131";
const dateStr = "2026-08-22";

test("FULL PIPELINE: a realistic 4-turn session tells the right evolving story in one file", () => {
  withTempDir((dir) => {
    // Turn 1: session just started. Nothing shipped, nothing uncommitted yet.
    const turn1: ReportInputs = {
      commits: [],
      gitStatus: "",
      aheadOfOrigin: "0",
      devMinutes: 0,
      pmMinutes: 5,
      idleMinutes: 0,
      decisionDiff: { closedOrChanged: [], newlyOpened: [], unaddressed: [] },
      riskDiff: { closedOrChanged: [], newlyOpened: [], unaddressed: [] },
    };
    appendTurnSection(dir, dateStr, sessionId, "2026-08-22T20:13:25Z", buildReportBody(turn1));

    // Turn 2: real code edits made, not yet committed.
    const turn2: ReportInputs = {
      ...turn1,
      gitStatus: " M scripts/generate-executive-report.ts",
      devMinutes: 12,
      pmMinutes: 5,
    };
    appendTurnSection(dir, dateStr, sessionId, "2026-08-22T20:26:14Z", buildReportBody(turn2));

    // Turn 3: committed. Working tree clean again.
    const turn3: ReportInputs = {
      ...turn1,
      commits: [{ sha: "6b3aafd", subject: "Add strikethrough closure convention; fix dead decision-diff regex" }],
      gitStatus: "",
      devMinutes: 25,
      pmMinutes: 8,
      decisionDiff: { closedOrChanged: ["Decision 4: ~~MVP Channel Scope~~ (RESOLVED 2026-08-09)"], newlyOpened: [], unaddressed: [] },
    };
    appendTurnSection(dir, dateStr, sessionId, "2026-08-22T21:01:16Z", buildReportBody(turn3));

    // Turn 4: idle gap happened, session wrapping up.
    const turn4: ReportInputs = { ...turn3, idleMinutes: 15 };
    appendTurnSection(dir, dateStr, sessionId, "2026-08-22T22:34:29Z", buildReportBody(turn4));

    const path = reportPathForSession(dir, dateStr, sessionId);
    const content = readFileSync(path, "utf8");

    // One file, four turns, all preserved.
    assert.equal(readdirSync(dir).length, 1);
    assert.equal(countTurnSections(path), 4);

    // The story is legible turn by turn: nothing shipped -> uncommitted work
    // appears -> commit lands and a decision closes -> idle time recorded.
    const turnBlocks = content.split(/^## Turn @ /m).slice(1);
    assert.ok(turnBlocks[0].includes("No commits landed yet this session."));
    assert.ok(turnBlocks[1].includes("scripts/generate-executive-report.ts"));
    assert.ok(turnBlocks[2].includes("6b3aafd"));
    assert.ok(turnBlocks[2].includes("Decision 4"));
    assert.ok(turnBlocks[3].includes("Idle: 0.25h"));

    // Complete-record property: reading the file after ANY turn (simulating
    // a crash right after that turn) shows a coherent, non-corrupt state -
    // not just the very last one.
    for (const block of turnBlocks) {
      assert.ok(block.includes("What Shipped") && block.includes("Executive Decision Points"));
    }
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
