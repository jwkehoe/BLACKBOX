# BLACKBOX

Portable core of a "one file per session, append a section every turn" session-close report mechanism for Claude Code projects — like an aircraft flight recorder: never overwritten, never more than one turn stale, survives up to the exact moment of the last successful write.

Extracted from [Thalam](../Thalam) (`scripts/generate-executive-report.ts`, `scripts/session-close.ts`) 2026-08-22, where it replaced a design that wrote a brand-new file on every `Stop`-hook fire. `Stop` fires at the end of every assistant turn, not at true session end, so that produced 148 near-duplicate files across one project's history — most saying "no commits landed" since most turns land no commits.

Companion skill: `~/.claude/skills/close-session/SKILL.md` — the judgment half (what to check: uncommitted/unpushed work, changelog staleness, decision/risk doc status, stakeholder-report staleness, deployment status). That skill is already global, needs no per-project setup, and generalizes by discovering each project's own conventions rather than assuming Thalam's. This repo is the mechanical half, which does need per-project setup.

## What's here

- `lib/append-report.ts` — the core: `reportPathForSession()` (one path per full session_id, never truncated — a truncated prefix isn't collision-safe) and `appendTurnSection()` (creates the file with a header on first call, appends a `## Turn @ <timestamp>` section on every call after). Zero project-specific assumptions.
- `lib/build-report-body.ts` — renders content sections (What Shipped / PR-Merge Status / Dev-PM-Idle / Executive Decision Points) from plain data passed in. This is the part most likely to need real adaptation per project — Thalam's version reads `DECISION_PATH.md`/`RISK_REGISTER.md` with regexes specific to its own doc conventions; treat it as an example shape, not a drop-in.
- `test/append-report.test.ts`, `test/full-pipeline.test.ts` — 8 tests (unit + end-to-end), including a simulated-crash recoverability case and a real-data replay proving the file-per-turn pile-up is actually fixed.

Run tests: `npm test` (or `npx tsx test/<file>.test.ts` directly — no install required, `npx` fetches `tsx` on demand).

## What's NOT here — rebuild per project

- **The actual `Stop`-hook wiring.** Lives in each project's own `.claude/settings.json`, typically gitignored, so it never travels with a repo. Every new project needs its own hook pointing at its own session-close script, with its own absolute path.
- **The advisory checks** (time-log, changelog, temp-features, git-status, EC_Status-staleness, deployment-status). Thalam's versions are straightforward to port but reference Thalam-specific paths (`00_CONTROL/time_log.csv`, `.Executive_Correspondence/.last-status.json`, etc.) — port the pattern, not the paths.
- **The Vercel/GitHub deployment check** assumes a GitHub repo with Vercel's GitHub App integration installed (reads the native commit status via `gh api repos/{owner}/{repo}/commits/{sha}/status`). Doesn't apply as-is to a project on a different host.

## Applying this to a new project

1. Copy `lib/append-report.ts` in as-is — it's generic.
2. Write that project's own `build-report-body.ts`: whatever sections matter there, sourced from whatever docs/conventions it actually has.
3. Write a `session-close.ts` for that project: the advisory checks that make sense, then call the append-report function.
4. Wire `.claude/settings.json`'s `Stop` hook, with that project's own absolute path.
5. Test it the way this was tested — a real-data dry run before trusting it, and ideally an isolated sandbox pass (own throwaway git repo) before touching anything real.

## Closure convention this depends on

If a target project has (or adopts) numbered-decision or ID-based-risk-row tracking, the report's ability to detect *closures* (not just new entries) depends on striking through the whole resolved entry — heading and body, not just a label — rather than deleting it. A deleted row leaves no trace for a before/after diff to find. See Thalam's `RISK_REGISTER.md`/`DECISION_PATH.md` for the convention in practice, and `generate-executive-report.ts`'s `extractDecisionLines()`/`diffDecisionPoints()` for the diff logic it enables.
