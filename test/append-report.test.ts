import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTurnSection, countTurnSections, lastTurnSection, reportPathForSession } from "../lib/append-report.ts";

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
  const dir = mkdtempSync(join(tmpdir(), "append-report-test-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("first turn creates exactly one file with a header and one section", () => {
  withTempDir((dir) => {
    appendTurnSection(dir, "2026-08-22", "s1-full-id", "2026-08-22T10:00:00Z", "content A");
    const files = readdirSync(dir);
    assert.equal(files.length, 1);
    assert.equal(countTurnSections(reportPathForSession(dir, "2026-08-22", "s1-full-id")), 1);
  });
});

test("second turn appends a second section to the SAME file - no new file created", () => {
  withTempDir((dir) => {
    appendTurnSection(dir, "2026-08-22", "s1-full-id", "2026-08-22T10:00:00Z", "content A");
    appendTurnSection(dir, "2026-08-22", "s1-full-id", "2026-08-22T10:05:00Z", "content B");
    const files = readdirSync(dir);
    assert.equal(files.length, 1, "still exactly one file, not two");
    assert.equal(countTurnSections(reportPathForSession(dir, "2026-08-22", "s1-full-id")), 2);
  });
});

test("earlier sections are preserved, not overwritten - full history survives", () => {
  withTempDir((dir) => {
    appendTurnSection(dir, "2026-08-22", "s1-full-id", "2026-08-22T10:00:00Z", "content A");
    appendTurnSection(dir, "2026-08-22", "s1-full-id", "2026-08-22T10:05:00Z", "content B");
    const path = reportPathForSession(dir, "2026-08-22", "s1-full-id");
    const content = readFileSync(path, "utf8");
    assert.ok(content.includes("content A"), "first turn's content must still be present");
    assert.ok(content.includes("content B"), "second turn's content must be present");
    assert.ok(content.indexOf("content A") < content.indexOf("content B"), "chronological order preserved");
  });
});

test("the last section always reflects the most recent turn (complete-record property)", () => {
  withTempDir((dir) => {
    appendTurnSection(dir, "2026-08-22", "s1-full-id", "2026-08-22T10:00:00Z", "state as of turn 1");
    appendTurnSection(dir, "2026-08-22", "s1-full-id", "2026-08-22T10:05:00Z", "state as of turn 2");
    appendTurnSection(dir, "2026-08-22", "s1-full-id", "2026-08-22T10:10:00Z", "state as of turn 3");
    const path = reportPathForSession(dir, "2026-08-22", "s1-full-id");
    const last = lastTurnSection(path);
    assert.ok(last?.includes("state as of turn 3"));
    assert.ok(!last?.includes("state as of turn 2"), "last section should not bleed into the previous one");
  });
});

test("different sessions never collide into the same file, even same date", () => {
  withTempDir((dir) => {
    appendTurnSection(dir, "2026-08-22", "session-AAAAAAAA-1111", "2026-08-22T10:00:00Z", "session A's content");
    appendTurnSection(dir, "2026-08-22", "session-BBBBBBBB-2222", "2026-08-22T10:01:00Z", "session B's content");
    const files = readdirSync(dir);
    assert.equal(files.length, 2);
  });
});

test("RECOVERABILITY: if a turn's write crashes right after (simulated by not calling append again), the file up to the last successful append is still fully intact and readable", () => {
  withTempDir((dir) => {
    appendTurnSection(dir, "2026-08-22", "s1-full-id", "2026-08-22T10:00:00Z", "turn 1 - fully written");
    // Simulated crash: turn 2 never happens. Nothing further is appended.
    const path = reportPathForSession(dir, "2026-08-22", "s1-full-id");
    const content = readFileSync(path, "utf8");
    assert.ok(content.includes("turn 1 - fully written"));
    assert.equal(countTurnSections(path), 1);
    // The file is valid and complete as of the last successful turn - no
    // half-written section, no corruption. Nothing was lost beyond the
    // work that genuinely never happened (unrecoverable in any model).
  });
});

test("END-TO-END: real 18-firing sequence produces ONE file with all 18 sections, most recent last", () => {
  withTempDir((dir) => {
    const realFirings = [
      "2026-08-22T20:13:25.722Z", "2026-08-22T20:19:38.347Z", "2026-08-22T20:26:14.331Z",
      "2026-08-22T21:01:16.686Z", "2026-08-22T21:13:35.450Z", "2026-08-22T21:26:34.253Z",
      "2026-08-22T21:42:34.581Z", "2026-08-22T21:53:23.609Z", "2026-08-22T21:56:59.826Z",
      "2026-08-22T22:06:47.631Z", "2026-08-22T22:11:49.566Z", "2026-08-22T22:19:08.856Z",
      "2026-08-22T22:20:48.588Z", "2026-08-22T22:26:20.418Z", "2026-08-22T22:29:10.183Z",
      "2026-08-22T22:31:19.576Z", "2026-08-22T22:33:23.689Z", "2026-08-22T22:34:29.012Z",
    ];

    let path = "";
    for (const ts of realFirings) {
      path = appendTurnSection(dir, "2026-08-22", "021c85b1-0d54-40c6-a119-6bcb0382d131", ts, `state as of ${ts}`);
    }

    const files = readdirSync(dir);
    assert.equal(files.length, 1, "exactly one file for the whole session, regardless of turn count");
    assert.equal(countTurnSections(path), 18, "every turn's section preserved");
    assert.ok(lastTurnSection(path)?.includes(realFirings[realFirings.length - 1]));
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
