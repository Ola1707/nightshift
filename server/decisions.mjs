// Decisions Claude made alone during a run (run.json `decisions: [{ id, text }]`, on a task or at the top for the
// run's own). The owner answers each one: OK (`checked: true`), Revert now (`revert: "now"`, Claude undoes it at
// once) or Revert later (`revert: "later"`, Claude adds a task that undoes it), saved with a note in the run's qa.json
// under `decision:<id>`. An unanswered decision never blocks "Review done" or a deploy: it shows on the pick page under
// "Decisions from last night" until it is answered. Also solutions (ways forward on a task; `solution:<id>`,
// `do: "now" | "later"`, none = don't). Reverts and picked solutions wait under "Waiting for Claude" until Claude
// handles them and records them in <paths.board>/handled.json.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The qa.json key of a decision. */
export const decisionKey = (id) => `decision:${id}`;

/**
 * Every decision of a run: the tasks' ones (with the task's id and title) first, then the run's own (task null).
 * @param {object} run the parsed run.json
 * @returns {{ id: string, text: string, taskId: string | null, taskTitle: string | null }[]}
 */
export function allDecisions(run) {
  const fromTasks = (run?.tasks ?? []).flatMap((task) =>
    (task.decisions ?? []).map((d) => ({
      id: d.id,
      text: d.text,
      taskId: task.id ?? null,
      taskTitle: task.title ?? null,
    })),
  );
  const own = (run?.decisions ?? []).map((d) => ({
    id: d.id,
    text: d.text,
    taskId: null,
    taskTitle: null,
  }));
  return [...fromTasks, ...own];
}

/**
 * The decisions the owner has not answered (neither OK nor Revert). A note without an answer is still open.
 * @param {object} run the parsed run.json
 * @param {Record<string, { checked?: boolean, note?: string }>} qa the parsed qa.json
 */
export function openDecisions(run, qa = {}) {
  return allDecisions(run).filter((d) => !answered(qa[decisionKey(d.id)]));
}

/** "now" or "later": what the owner asked for (a decision's revert, a solution's do), or null. */
const nowOrLater = (value) => (value === "now" || value === "later" ? value : null);

/** How the owner wants a decision undone: "now", "later" (as a task), or null. */
export const revertOf = (state) => (state?.checked ? null : nowOrLater(state?.revert));

/** OK or a revert. */
export const answered = (state) => state?.checked === true || revertOf(state) !== null;

/** The qa.json key of a solution (a way forward the owner can pick on a task). */
export const solutionKey = (id) => `solution:${id}`;

/**
 * Every solution of a run: run.json `solutions: [{ id, text }]` on a task (a way forward for something not done) or
 * at the top for the run's own.
 */
export function allSolutions(run) {
  const fromTasks = (run?.tasks ?? []).flatMap((task) =>
    (task.solutions ?? []).map((s) => ({ id: s.id, text: s.text, taskId: task.id ?? null, taskTitle: task.title ?? null })),
  );
  return [...fromTasks, ...(run?.solutions ?? []).map((s) => ({ id: s.id, text: s.text, taskId: null, taskTitle: null }))];
}

const readJsonOr = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const runNames = (runsDir) =>
  existsSync(runsDir)
    ? readdirSync(runsDir)
        .filter((name) => existsSync(join(runsDir, name, "run.json")))
        .sort()
        .reverse()
    : [];

/**
 * "Waiting for Claude": every decision marked Revert now / Revert later and every solution marked Do it now / Later
 * that Claude hasn't handled yet, newest run first. `ref` ("<run>/<qa key>") is the key Claude records in
 * <paths.board>/handled.json once done: { "<ref>": { how, done, at } }.
 * @param {string} runsDir the runs folder (paths.runs)
 * @param {string} handledFile <paths.board>/handled.json
 * @returns {{ run: string, ref: string, kind: "revert" | "solution", how: "now" | "later", id: string, text: string, taskId: string | null, taskTitle: string | null, note: string }[]}
 */
export function waitingOfRuns(runsDir, handledFile) {
  const handled = readJsonOr(handledFile, {});
  return runNames(runsDir).flatMap((name) => {
    const run = readJsonOr(join(runsDir, name, "run.json"), {});
    const qa = readJsonOr(join(runsDir, name, "qa.json"), {});
    const reverts = allDecisions(run).map((d) => ({ ...d, kind: "revert", key: decisionKey(d.id), how: revertOf(qa[decisionKey(d.id)]) }));
    const solutions = allSolutions(run).map((s) => ({ ...s, kind: "solution", key: solutionKey(s.id), how: nowOrLater(qa[solutionKey(s.id)]?.do) }));
    return [...reverts, ...solutions]
      .filter((x) => x.how && !handled[`${name}/${x.key}`])
      .map(({ key, ...x }) => ({ run: name, ref: `${name}/${key}`, ...x, note: qa[key]?.note ?? "" }));
  });
}

/**
 * The pick page's "Decisions from last night": every open decision of every run folder with a run.json, newest run
 * first, each with its run name and the note the owner wrote so far.
 * @param {string} runsDir the runs folder (paths.runs)
 * @returns {{ run: string, taskId: string | null, taskTitle: string | null, id: string, text: string, note: string }[]}
 */
export function openDecisionsOfRuns(runsDir) {
  if (!existsSync(runsDir)) return [];
  const read = (path, fallback) =>
    existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
  return readdirSync(runsDir)
    .filter((name) => existsSync(join(runsDir, name, "run.json")))
    .sort()
    .reverse()
    .flatMap((name) => {
      const qa = read(join(runsDir, name, "qa.json"), {});
      return openDecisions(read(join(runsDir, name, "run.json"), {}), qa).map((d) => ({
        run: name,
        taskId: d.taskId,
        taskTitle: d.taskTitle,
        id: d.id,
        text: d.text,
        note: qa[decisionKey(d.id)]?.note ?? "",
      }));
    });
}
