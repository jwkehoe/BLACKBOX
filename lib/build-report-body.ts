// Renders the same content sections the real generate-executive-report.ts
// produces (What Shipped / PR-Merge Status / Dev-PM-Idle / Executive
// Decision Points), but takes already-gathered data as plain arguments
// instead of shelling out to git itself. Keeps this testable in isolation
// and keeps the sandbox fully independent of any real repo's git history -
// the real script's job is just to gather these same inputs and hand them
// here (or inline-render them the same way); this function is the part
// that's identical between "one file per turn" and "append one section per
// turn" - only the OUTER write mechanism (writeFileSync vs appendFileSync
// to a per-turn vs per-session path) changes between the two models.

export interface ReportInputs {
  commits: { sha: string; subject: string }[];
  gitStatus: string;
  aheadOfOrigin: string;
  devMinutes: number;
  pmMinutes: number;
  idleMinutes: number;
  decisionDiff: { closedOrChanged: string[]; newlyOpened: string[]; unaddressed: string[] };
  riskDiff: { closedOrChanged: string[]; newlyOpened: string[]; unaddressed: string[] };
}

export function buildReportBody(inputs: ReportInputs): string {
  const lines: string[] = [];

  lines.push("### What Shipped");
  lines.push("");
  if (inputs.commits.length === 0) {
    lines.push("No commits landed yet this session.");
  } else {
    for (const c of inputs.commits) lines.push(`- **${c.subject}** (\`${c.sha}\`)`);
  }
  lines.push("");

  lines.push("### PR / Merge Status");
  lines.push("");
  if (inputs.gitStatus) {
    lines.push("Uncommitted work as of this turn:");
    lines.push("```");
    lines.push(inputs.gitStatus);
    lines.push("```");
  } else if (inputs.aheadOfOrigin !== "0") {
    lines.push(`${inputs.aheadOfOrigin} commit(s) ahead of \`origin/main\`.`);
  } else {
    lines.push("All work committed and pushed.");
  }
  lines.push("");

  lines.push("### Dev / PM / Idle Time (session total as of this turn)");
  lines.push("");
  lines.push(`- Dev: ${(inputs.devMinutes / 60).toFixed(2)}h`);
  lines.push(`- PM: ${(inputs.pmMinutes / 60).toFixed(2)}h`);
  lines.push(`- Idle: ${(inputs.idleMinutes / 60).toFixed(2)}h`);
  lines.push("");

  lines.push("### Executive Decision Points");
  lines.push("");
  const closed = [...inputs.decisionDiff.closedOrChanged, ...inputs.riskDiff.closedOrChanged];
  lines.push("**Closed / Changed:** " + (closed.length ? closed.join("; ") : "None."));
  const opened = [...inputs.decisionDiff.newlyOpened, ...inputs.riskDiff.newlyOpened];
  lines.push("**Newly Opened:** " + (opened.length ? opened.join("; ") : "None."));
  lines.push("");

  return lines.join("\n");
}
