import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Model 3: one file per session, appended to on every Stop-hook turn -
// never a new file per turn, never overwritten. Each appended section is
// the FULL current state (same content the report always computed anyway,
// diffed from session-start baseline - see generate-executive-report.ts),
// not an incremental delta. Net effect:
//   - Complete record at any failure state: the file is never more than
//     one turn stale, since every turn writes to it.
//   - No pile-up: one file per session, not one per turn.
//   - Full turn-by-turn trail preserved (unlike overwrite-in-place),
//     matching how AuditLog already works in the product itself -
//     append-only, immutable, nothing replaced.
//
// appendFileSync is a single syscall-level append; there's no separate
// "check then write" step to race or partially fail between, so no
// gating/boundary-detection state file is needed at all for this model.

export function reportPathForSession(dir: string, dateStr: string, sessionId: string): string {
  // Full session_id, not a prefix slice - a truncated prefix isn't
  // collision-safe (two session IDs sharing the same first N characters
  // would silently merge their reports into one file). Caught by test:
  // "different sessions never collide into the same file, even same date".
  return join(dir, `C_Suite-${dateStr}-${sessionId}.md`);
}

export function appendTurnSection(
  dir: string,
  dateStr: string,
  sessionId: string,
  turnTimestampIso: string,
  bodyMarkdown: string
): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = reportPathForSession(dir, dateStr, sessionId);

  if (!existsSync(path)) {
    const header = `# C-Suite Session Report — ${dateStr}\n\nSession: \`${sessionId}\`\n`;
    writeFileSync(path, header);
  }

  const section = `\n---\n\n## Turn @ ${turnTimestampIso}\n\n${bodyMarkdown}\n`;
  appendFileSync(path, section);

  return path;
}

export function countTurnSections(path: string): number {
  if (!existsSync(path)) return 0;
  const content = readFileSync(path, "utf8");
  return (content.match(/^## Turn @ /gm) ?? []).length;
}

export function lastTurnSection(path: string): string | null {
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  const sections = content.split(/\n---\n\n## Turn @ /).slice(1);
  if (sections.length === 0) return null;
  return `## Turn @ ${sections[sections.length - 1]}`.trimEnd();
}
