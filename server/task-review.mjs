// What a finished review does to the JSON task files (docs/plan-tasks-json.md, point 3):
//   accepted → the task moves to <base>-done.json with status "done"; rejected → it stays (or goes back) "open"
//   with the review note. So a task the owner accepted never stays on the open list.
//   settleTasks(projectDir, config, { run, qa, runName, at, only })  one run's review
//   settleReviewedRuns(projectDir, config, { only })                 every run whose review is done, newest first
// A run.json task matches a JSON task by `id`, else by its title (bold, a final bracket such as the code or "(P2)", and a
// final period ignored).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const write = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

const plainTitle = (s = "") =>
  s
    .replace(/[*_`]/g, "")
    .replace(/\.$/, "")
    .replace(/\s*\([^()]*\)\s*\.?$/, "")
    .replace(/\.$/, "")
    .trim()
    .toLowerCase();

/**
 * The owner's verdict on one run task: "accepted", "rejected" or null (nothing to settle).
 * A tick accepts. A note without a tick rejects. A task the run finished ("done") with no note is accepted by Review done.
 */
export function verdict(runTask, qaEntry) {
  if (qaEntry?.checked) return "accepted";
  if (qaEntry?.note?.trim()) return "rejected";
  return runTask.status === "done" ? "accepted" : null;
}

/** The open JSON task files: <paths.tasks>/<base>.json of each taskFiles entry that exists. */
function taskFiles(dir, config) {
  return config.taskFiles
    .map(({ file }) => file.replace(/\.(md|json)$/, ""))
    .filter((base) => existsSync(join(dir, `${base}.json`)))
    .map((base) => ({ base, path: join(dir, `${base}.json`), data: readJson(join(dir, `${base}.json`), { tasks: [] }) }));
}

function findTask(files, runTask) {
  for (const file of files) {
    const byId = file.data.tasks.find((t) => runTask.id && t.id === runTask.id);
    if (byId) return { file, task: byId };
  }
  const title = plainTitle(runTask.title);
  if (!title) return null;
  for (const file of files) {
    const byTitle = file.data.tasks.find((t) => plainTitle(t.title) === title);
    if (byTitle) return { file, task: byTitle };
  }
  return null;
}

const firstLine = (s) => (typeof s === "string" ? s.split("\n")[0].trim() : "");

/**
 * Applies one run's review to the task files. `only`: the statuses a task may have to be settled (default: any but
 * "done"/"dropped"). Returns { moved: [{ number, title, file }], reopened: [{ number, title, note }] }.
 */
export function settleTasks(projectDir, config, { run, qa = {}, runName, at = new Date().toISOString(), only } = {}) {
  const dir = join(projectDir, config.paths.tasks);
  const files = taskFiles(dir, config);
  const report = { moved: [], reopened: [] };
  const on = at.slice(0, 10);
  const changed = new Set();
  const done = {}; // base → done file data
  for (const runTask of run?.tasks ?? []) {
    const found = findTask(files, runTask);
    if (!found) continue;
    const { file, task } = found;
    if (task.status === "done" || task.status === "dropped") continue;
    if (only && !only.includes(task.status ?? "open")) continue;
    const entry = qa[runTask.id];
    const result = verdict(runTask, entry);
    if (!result) continue;
    const note = entry?.note?.trim() || undefined;
    const review = { on, run: runName, accepted: result === "accepted", ...(note && { note }) };
    task.reviews = [...(task.reviews ?? []), review];
    changed.add(file);
    if (result === "rejected") {
      task.status = "open";
      report.reopened.push({ number: task.number, title: task.title, note });
      continue;
    }
    task.status = "done";
    const evidence = firstLine(runTask.done);
    task.done = task.done && typeof task.done === "object" ? task.done : { on, in: runName, ...(evidence && { evidence }) };
    file.data.tasks = file.data.tasks.filter((t) => t !== task);
    const donePath = join(dir, `${file.base}-done.json`);
    done[file.base] ??= readJson(donePath, { title: `${file.data.title} (done)`, tasks: [] });
    done[file.base].tasks.push(task);
    report.moved.push({ number: task.number, title: task.title, file: `${file.base}-done.json` });
  }
  for (const file of changed) write(file.path, file.data);
  for (const [base, data] of Object.entries(done)) write(join(dir, `${base}-done.json`), data);
  return report;
}

/**
 * Applies every finished review in the runs folder, newest run first: the newest review with a verdict on a task decides
 * (a settled task is no longer in `only`, so older runs leave it alone).
 */
export function settleReviewedRuns(projectDir, config, { only } = {}) {
  const runsDir = join(projectDir, config.paths.runs);
  const report = { moved: [], reopened: [] };
  if (!existsSync(runsDir)) return report;
  const runs = readdirSync(runsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(runsDir, d.name, "run.json")))
    .map((d) => d.name)
    .filter((name) => readJson(join(runsDir, name, "review.json"), {}).done === true)
    .sort((a, b) => (a.replace(/^\D+/, "") < b.replace(/^\D+/, "") ? 1 : -1));
  for (const name of runs) {
    const review = readJson(join(runsDir, name, "review.json"), {});
    const r = settleTasks(projectDir, config, {
      run: readJson(join(runsDir, name, "run.json"), { tasks: [] }),
      qa: readJson(join(runsDir, name, "qa.json"), {}),
      runName: name,
      at: review.at ?? new Date().toISOString(),
      only,
    });
    report.moved.push(...r.moved);
    report.reopened.push(...r.reopened);
  }
  return report;
}
