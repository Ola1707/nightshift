// Keeps the JSON task files in step with the runs (docs/plan-tasks-json.md, point 3; Ola, 2026-11-24):
//   a task a run finished (run.json status "done") moves to <base>-done.json at once, before any review or merge;
//   a tick on the review page keeps it there (or moves a partly done one there);
//   a note without a tick brings it back to <base>.json as "open", with the note in its reviews.
//   settleRun(projectDir, config, { run, qa, runName, at })  one run
//   settleAllRuns(projectDir, config)                         every run in the runs folder, oldest first (newer wins)
// A later word wins: a task with a review the owner made by hand (no `run`), or one from another run on a later day than
// this run's tick or note, is not moved by this run again.
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
 * What one run task means for its JSON task: "accepted" (ticked), "rejected" (the run finished it and the owner left a
 * note without a tick), "finished" (the run finished it, no verdict yet) or null (nothing to do: partly done or not
 * done and not ticked; a note there is a question or a remark, answered in the chat).
 */
export function verdict(runTask, qaEntry) {
  if (qaEntry?.checked) return "accepted";
  if (runTask.status !== "done") return null;
  return qaEntry?.note?.trim() ? "rejected" : "finished";
}

/** Each task file's open and done JSON: { base, open, done } with { path, data } each. */
function taskFiles(dir, config) {
  return config.taskFiles
    .map(({ file }) => file.replace(/\.(md|json)$/, ""))
    .filter((base) => existsSync(join(dir, `${base}.json`)))
    .map((base) => {
      const open = { path: join(dir, `${base}.json`) };
      open.data = readJson(open.path, { tasks: [] });
      const done = { path: join(dir, `${base}-done.json`) };
      done.data = readJson(done.path, { title: `${open.data.title} (done)`, tasks: [] });
      return { base, open, done };
    });
}

function findTask(files, runTask) {
  const all = files.flatMap((file) => [
    ...file.open.data.tasks.map((task) => ({ file, task, where: "open" })),
    ...file.done.data.tasks.map((task) => ({ file, task, where: "done" })),
  ]);
  const byId = runTask.id && all.find(({ task }) => task.id === runTask.id);
  if (byId) return byId;
  const title = plainTitle(runTask.title);
  return (title && all.find(({ task }) => plainTitle(task.title) === title)) || null;
}

const firstLine = (s) => (typeof s === "string" ? s.split("\n")[0].trim() : "");

/** Sets this run's review on the task (one per run): { on, run, accepted, note? }. Returns true when it changed. */
function setReview(task, review) {
  const reviews = task.reviews ?? [];
  const i = reviews.findIndex((r) => r.run === review.run);
  if (i !== -1 && JSON.stringify({ ...reviews[i], on: review.on }) === JSON.stringify(review)) return false;
  task.reviews = i === -1 ? [...reviews, review] : reviews.map((r, n) => (n === i ? review : r));
  return true;
}

/**
 * Applies one run to the task files. Returns { moved: [{ number, title }], reopened: [{ number, title, note }] }:
 * moved = into the done file, reopened = back to the open file.
 */
export function settleRun(projectDir, config, { run, qa = {}, runName, at = new Date().toISOString() } = {}) {
  const dir = join(projectDir, config.paths.tasks);
  const files = taskFiles(dir, config);
  const report = { moved: [], reopened: [] };
  const on = at.slice(0, 10);
  const changed = new Set();
  for (const runTask of run?.tasks ?? []) {
    const found = findTask(files, runTask);
    if (!found) continue;
    const { file, task, where } = found;
    if (task.status === "dropped") continue;
    const entry = qa[runTask.id];
    const since = (entry?.at ?? at).slice(0, 10);
    if ((task.reviews ?? []).some((r) => !r.run || (r.run !== runName && r.on > since))) continue;
    const result = verdict(runTask, entry);
    if (!result) continue;
    const note = entry?.note?.trim() || undefined;
    if (result !== "finished" && setReview(task, { on, run: runName, accepted: result === "accepted", ...(note && { note }) }))
      changed.add(file);
    if (result === "rejected" && where === "done") {
      task.status = "open";
      file.done.data.tasks = file.done.data.tasks.filter((t) => t !== task);
      file.open.data.tasks.push(task);
      changed.add(file);
      report.reopened.push({ number: task.number, title: task.title, note });
    } else if (result !== "rejected" && where === "open") {
      task.status = "done";
      const evidence = firstLine(runTask.done);
      if (!task.done || typeof task.done !== "object") task.done = { on, in: runName, ...(evidence && { evidence }) };
      file.open.data.tasks = file.open.data.tasks.filter((t) => t !== task);
      file.done.data.tasks.push(task);
      changed.add(file);
      report.moved.push({ number: task.number, title: task.title });
    } else if (result === "rejected" && task.status !== "open") {
      task.status = "open";
      changed.add(file);
    }
  }
  for (const file of changed) {
    write(file.open.path, file.open.data);
    if (file.done.data.tasks.length || existsSync(file.done.path)) write(file.done.path, file.done.data);
  }
  return report;
}

/** Every run folder with a run.json, oldest first, so the newest run's word on a task is the last one applied. */
export function settleAllRuns(projectDir, config) {
  const runsDir = join(projectDir, config.paths.runs ?? "");
  const report = { moved: [], reopened: [] };
  if (!config.paths.runs || !existsSync(runsDir)) return report;
  const key = (name) => name.replace(/^\D+/, "");
  const runs = readdirSync(runsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(runsDir, d.name, "run.json")))
    .map((d) => d.name)
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  for (const name of runs) {
    const folder = join(runsDir, name);
    const r = settleRun(projectDir, config, {
      run: readJson(join(folder, "run.json"), { tasks: [] }),
      qa: readJson(join(folder, "qa.json"), {}),
      runName: name,
      at: readJson(join(folder, "review.json"), {}).at,
    });
    report.moved.push(...r.moved);
    report.reopened.push(...r.reopened);
  }
  return report;
}
