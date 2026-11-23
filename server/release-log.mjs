// "Review done" writes the review into the run's release logs (docs/release-log/<env>-<date>_<time>.md, the part in
// git): the QA column of each change that names a reviewed task's code, and a "## Review" section with every QA task.
// The run folder itself (run.json, qa.json, screenshots) is in git too, except its videos. The section also lists
// each decision made alone (ticked or open, with its note) and each fixed test the owner wrote a note on.
import { allDecisions, decisionKey } from "./decisions.mjs";

const REVIEW_HEADING = "## Review";

const qaMark = (state) => (state?.note ? "✗" : state?.checked ? "☑" : "☐");
const cell = (text) =>
  String(text ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");

// A change row names a task when its Change cell holds the code as a whole word, e.g. "(T.1)" or "Fix B.2:".
function codeIn(text, code) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w.])${escaped}($|[^\\w])`).test(text);
}

function markQaColumn(markdown, tasks, qa) {
  let qaColumn = -1;
  return markdown
    .split("\n")
    .map((line) => {
      if (!line.startsWith("|")) {
        qaColumn = -1;
        return line;
      }
      const cells = line.split(/(?<!\\)\|/).slice(1, -1);
      if (cells.some((c) => c.trim() === "QA") && cells.some((c) => c.trim() === "Change")) {
        qaColumn = cells.findIndex((c) => c.trim() === "QA");
        return line;
      }
      if (qaColumn < 0 || /^\s*-+\s*$/.test(cells[0])) return line;
      const task = tasks.find((t) => codeIn(cells[1] ?? "", t.id));
      if (!task) return line;
      cells[qaColumn] = ` ${qaMark(qa[task.id])} `;
      return `|${cells.join("|")}|`;
    })
    .join("\n");
}

function reviewSection(run, qa, doneAt) {
  const rows = run.tasks
    .filter((t) => t.qa)
    .map(
      (t) =>
        `| ${cell(t.id)} | ${cell(t.title)} | ${qaMark(qa[t.id])} | ${cell(qa[t.id]?.note || "")} |`,
    );
  const checked = run.tasks.filter((t) => t.qa && qa[t.id]?.checked).length;
  return [
    REVIEW_HEADING,
    "",
    `Reviewed on the AI board, done ${doneAt.slice(0, 16).replace("T", " ")} (${run.title}): ${checked} of ${rows.length} QA items checked. ☑ checked, ✗ problem found (note), ☐ not checked.`,
    "",
    "| Task | Change | QA | Note |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    ...decisionRows(run, qa),
    ...fixedTestRows(run, qa),
    ...proposedRows(run, qa),
  ].join("\n");
}

// Each decision Claude made alone: ✓ when the owner ticked it, "open" when not (it carries over to the pick page).
function decisionRows(run, qa) {
  const decisions = allDecisions(run);
  if (!decisions.length) return [];
  const ticked = decisions.filter((d) => qa[decisionKey(d.id)]?.checked).length;
  return [
    `Decisions: ${ticked} of ${decisions.length} ticked (open ones carry over to the pick page).`,
    "",
    "| Decision | Task | OK | Note |",
    "| --- | --- | --- | --- |",
    ...decisions.map((d) => {
      const state = qa[decisionKey(d.id)];
      return `| ${cell(d.text)} | ${cell(d.taskId ?? "run")} | ${state?.checked ? "✓" : "open"} | ${cell(state?.note || "")} |`;
    }),
    "",
  ];
}

// Fixed failed tests that the owner wrote a note on.
function fixedTestRows(run, qa) {
  const noted = (run.failures ?? []).filter(
    (f) => f.fixedIn !== "not fixed" && qa[`failure:${f.test}`]?.note,
  );
  if (!noted.length) return [];
  return [
    "Notes on fixed tests:",
    "",
    "| Test | Fixed in | Note |",
    "| --- | --- | --- |",
    ...noted.map(
      (f) => `| ${cell(f.test)} | ${cell(f.fixedIn)} | ${cell(qa[`failure:${f.test}`].note)} |`,
    ),
    "",
  ];
}

/** Proposed items: strings (older runs, id = their number) or { id, text }; the owner's tick and note under `proposed:<id>`. */
// An item about one task or one failed test sits on it (`proposed` on that task or failure), not in the run's list.
export const ownProposed = (list) =>
  (list ?? []).map((p, i) =>
    typeof p === "string" ? { id: String(i + 1), text: p } : { id: String(p.id), text: p.text },
  );
export const proposedItems = (run) => [
  ...ownProposed(run?.proposed),
  ...(run?.tasks ?? []).flatMap((t) => ownProposed(t.proposed)),
  ...(run?.failures ?? []).flatMap((f) => ownProposed(f.proposed)),
];

// Proposed items the owner ticked ("add as an action item") or wrote on; Claude adds the ticked ones to a roadmap or bugs file.
function proposedRows(run, qa) {
  const marked = proposedItems(run).filter((p) => qa[`proposed:${p.id}`]?.checked || qa[`proposed:${p.id}`]?.note);
  if (!marked.length) return [];
  return [
    "Proposed items:",
    "",
    "| Item | Add as an action item | Note |",
    "| --- | --- | --- |",
    ...marked.map((p) => {
      const state = qa[`proposed:${p.id}`];
      return `| ${cell(p.text)} | ${state.checked ? "☑ yes" : "☐ no"} | ${cell(state.note || "")} |`;
    }),
    "",
  ];
}

/** The release log with the review written in; doing it again replaces the earlier review. */
export function writeReview(markdown, run, qa, doneAt) {
  const marked = markQaColumn(
    markdown,
    run.tasks.filter((t) => t.qa && t.id),
    qa,
  );
  const start = marked.indexOf(`\n${REVIEW_HEADING}\n`);
  if (start < 0) return `${marked.trimEnd()}\n\n${reviewSection(run, qa, doneAt)}`;
  const next = marked.indexOf("\n## ", start + 1);
  const rest = next < 0 ? "" : marked.slice(next);
  return `${marked.slice(0, start).trimEnd()}\n\n${reviewSection(run, qa, doneAt)}${rest}`;
}
