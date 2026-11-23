// Decisions Claude made alone during a run (run.json `decisions: [{ id, text }]`, on a task or at the top for the
// run's own). The owner answers each one: OK (`checked: true`), Revert now (`revert: "now"`, Claude undoes it at
// once) or Revert as task (`revert: "task"`, Claude adds a task that undoes it), saved with a note in the run's qa.json
// under `decision:<id>`. An unanswered decision never blocks "Review done" or a deploy: it shows on the pick page under
// "Decisions from last night" until it is answered. A revert shows under "To revert" until Claude handles it and
// records it in <paths.board>/reverts.json: { "<run>/<id>": { how, done, at } }.
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

/** How the owner wants a decision undone: "now", "task", or null. */
export const revertOf = (state) => (state?.checked ? null : state?.revert === "now" || state?.revert === "task" ? state.revert : null);

/** OK or a revert. */
export const answered = (state) => state?.checked === true || revertOf(state) !== null;

const readJsonOr = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const runNames = (runsDir) =>
  existsSync(runsDir)
    ? readdirSync(runsDir)
        .filter((name) => existsSync(join(runsDir, name, "run.json")))
        .sort()
        .reverse()
    : [];

/**
 * "To revert": every decision marked Revert now or Revert as task that Claude hasn't handled yet (not in
 * reverts.json), newest run first. `ref` is "<run>/<id>", the key Claude records in reverts.json.
 * @param {string} runsDir the runs folder (paths.runs)
 * @param {string} revertsFile <paths.board>/reverts.json
 */
export function revertsOfRuns(runsDir, revertsFile) {
  const handled = readJsonOr(revertsFile, {});
  return runNames(runsDir).flatMap((name) => {
    const run = readJsonOr(join(runsDir, name, "run.json"), {});
    const qa = readJsonOr(join(runsDir, name, "qa.json"), {});
    return allDecisions(run)
      .map((d) => ({ d, how: revertOf(qa[decisionKey(d.id)]) }))
      .filter(({ d, how }) => how && !handled[`${name}/${d.id}`])
      .map(({ d, how }) => ({ run: name, ref: `${name}/${d.id}`, how, ...d, note: qa[decisionKey(d.id)]?.note ?? "" }));
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
