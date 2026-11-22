// Decisions Claude made alone during a run (run.json `decisions: [{ id, text }]`, on a task or at the top for the
// run's own). The owner ticks each one on the review page; the tick and note are saved in the run's qa.json under
// `decision:<id>`. An unticked decision never blocks "Review done" or a deploy: it shows on the pick page under
// "Decisions from last night" until it is ticked.
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
 * The decisions the owner has not ticked: `qa["decision:" + id]?.checked` is not true. A note without a tick is still open.
 * @param {object} run the parsed run.json
 * @param {Record<string, { checked?: boolean, note?: string }>} qa the parsed qa.json
 */
export function openDecisions(run, qa = {}) {
  return allDecisions(run).filter((d) => qa[decisionKey(d.id)]?.checked !== true);
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
