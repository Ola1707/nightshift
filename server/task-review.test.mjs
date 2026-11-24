import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { convertProject } from "./tasks-json.mjs";
import { settleAllRuns, settleRun, verdict } from "./task-review.mjs";

const config = {
  paths: { tasks: "docs/roadmap/night-run", runs: "docs/release-log", roadmaps: "docs/roadmap" },
  taskFiles: [{ file: "small-fix.md" }, { file: "bug.md" }],
};
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const put = (path, data) => writeFileSync(path, typeof data === "string" ? data : JSON.stringify(data, null, 2));

function project() {
  const dir = mkdtempSync(join(tmpdir(), "task-review-"));
  mkdirSync(join(dir, config.paths.tasks), { recursive: true });
  mkdirSync(join(dir, config.paths.runs), { recursive: true });
  return dir;
}
const tasks = (dir, name) => join(dir, config.paths.tasks, name);
const task = (number, id, title, status = "open") => ({ number, id, title, status, details: "", reviews: [] });
const ids = (dir, name) => json(tasks(dir, name)).tasks.map((t) => `${t.number} ${t.status}`);

function run(dir, name, runJson, qa) {
  const folder = join(dir, config.paths.runs, name);
  mkdirSync(folder, { recursive: true });
  put(join(folder, "run.json"), runJson);
  if (qa) put(join(folder, "qa.json"), qa);
}

test("verdict: a tick accepts, a note without a tick rejects, a done task is finished, partly done is nothing", () => {
  assert.equal(verdict({ status: "partial" }, { checked: true }), "accepted");
  assert.equal(verdict({ status: "done" }, { checked: false, note: "that wasn't the plan" }), "rejected");
  assert.equal(verdict({ status: "done" }, undefined), "finished");
  assert.equal(verdict({ status: "partial" }, undefined), null);
  assert.equal(verdict({ status: "not-done" }, { checked: false, note: "  " }), null);
  assert.equal(verdict({ status: "not-done" }, { checked: false, note: "what does it wait for?" }), null);
});

test("a task the run finished moves to the done file at once, with no review", () => {
  const dir = project();
  put(tasks(dir, "small-fix.json"), {
    title: "Small fixes",
    tasks: [task(2, "8A.2cs", "Admin Versions"), task(3, "8A.2cl", "Admin Health"), task(4, "other", "Not in the run")],
  });
  run(dir, "night-run-2026-11-23", {
    tasks: [
      { id: "8A.2cs", title: "Admin Versions", status: "done", done: "Sticky cell.\nMore." },
      { id: "8A.2cl", title: "Admin Health", status: "partial" },
    ],
  });
  const report = settleAllRuns(dir, config);
  assert.deepEqual(report.moved.map((t) => t.number), [2]);
  assert.deepEqual(ids(dir, "small-fix.json"), ["3 open", "4 open"]);
  const done = json(tasks(dir, "small-fix-done.json"));
  assert.equal(done.title, "Small fixes (done)");
  assert.equal(done.tasks[0].status, "done");
  assert.equal(done.tasks[0].done.in, "night-run-2026-11-23");
  assert.equal(done.tasks[0].done.evidence, "Sticky cell.");
  assert.deepEqual(done.tasks[0].reviews, []);
  // Loading the board again changes nothing.
  assert.deepEqual(settleAllRuns(dir, config), { moved: [], reopened: [] });
});

test("a review note without a tick brings a finished task back to open; a tick then moves it to done again", () => {
  const dir = project();
  put(tasks(dir, "small-fix.json"), { title: "Small fixes", tasks: [task(1, "8A.2cr", "AI board: a task stands out")] });
  run(dir, "night-run-2026-11-23", { tasks: [{ id: "8A.2cr", title: "AI board", status: "done" }] });
  settleAllRuns(dir, config);
  assert.deepEqual(ids(dir, "small-fix-done.json"), ["1 done"]);
  const qa = join(dir, config.paths.runs, "night-run-2026-11-23", "qa.json");
  put(qa, { "8A.2cr": { checked: false, note: "show only the relevant part" } });
  assert.deepEqual(settleAllRuns(dir, config).reopened.map((t) => t.note), ["show only the relevant part"]);
  assert.deepEqual(ids(dir, "small-fix.json"), ["1 open"]);
  assert.deepEqual(ids(dir, "small-fix-done.json"), []);
  const reopened = json(tasks(dir, "small-fix.json")).tasks[0];
  assert.deepEqual(reopened.reviews.map((r) => [r.run, r.accepted, r.note]), [["night-run-2026-11-23", false, "show only the relevant part"]]);
  put(qa, { "8A.2cr": { checked: true, note: "ok now" } });
  settleAllRuns(dir, config);
  assert.deepEqual(ids(dir, "small-fix-done.json"), ["1 done"]);
  // One review per run: the tick replaced the note.
  assert.deepEqual(json(tasks(dir, "small-fix-done.json")).tasks[0].reviews.map((r) => [r.accepted, r.note]), [[true, "ok now"]]);
});

test("a tick moves a partly done task to done; a title match works when the ids differ", () => {
  const dir = project();
  put(tasks(dir, "bug.json"), { title: "Bugs", tasks: [task(23, "the-windowed-emulator", "**Tests: the windowed Android emulator boots (P4, very important)**")] });
  run(dir, "night-run-2026-11-23-2", { tasks: [{ id: "emulator-boot", title: "Tests: the windowed Android emulator boots", status: "partial" }] },
    { "emulator-boot": { checked: true, note: "" } });
  settleAllRuns(dir, config);
  assert.deepEqual(ids(dir, "bug-done.json"), ["23 done"]);
});

test("the owner's own decision (a review with no run) is final: a run's note doesn't reopen it", () => {
  const dir = project();
  const t = { ...task(11, "8A.2dd", "Test 5 holds a wait", "done"), reviews: [{ on: "2026-11-24", accepted: true, note: "done; new task" }] };
  put(tasks(dir, "bug.json"), { title: "Bugs", tasks: [] });
  put(tasks(dir, "bug-done.json"), { title: "Bugs (done)", tasks: [t] });
  run(dir, "day-run-2026-11-23", { tasks: [{ id: "8A.2dd", status: "done" }] }, { "8A.2dd": { checked: false, note: "60 s is too long" } });
  assert.deepEqual(settleRun(dir, config, { run: { tasks: [{ id: "8A.2dd", status: "done" }] }, qa: { "8A.2dd": { checked: false, note: "x" } }, runName: "r" }),
    { moved: [], reopened: [] });
  settleAllRuns(dir, config);
  assert.deepEqual(ids(dir, "bug-done.json"), ["11 done"]);
});

test("a decision from another run on a later day wins over this run's note", () => {
  const dir = project();
  const t = { ...task(11, "8A.2dd", "Test 5", "done"), reviews: [{ on: "2026-11-24", run: "day run 2026-11-23", accepted: true }] };
  put(tasks(dir, "bug.json"), { title: "Bugs", tasks: [] });
  put(tasks(dir, "bug-done.json"), { title: "Bugs (done)", tasks: [t] });
  run(dir, "day-run-2026-11-23", { tasks: [{ id: "8A.2dd", status: "done" }] },
    { "8A.2dd": { checked: false, note: "60 s is too long", at: "2026-11-23T20:33:11Z" } });
  settleAllRuns(dir, config);
  assert.deepEqual(ids(dir, "bug-done.json"), ["11 done"]);
});

test("the newest run's word wins: rejected in an older run, finished again in a newer one → done", () => {
  const dir = project();
  put(tasks(dir, "bug.json"), { title: "Bugs", tasks: [task(7, "8A.2cq", "iOS saved text")] });
  run(dir, "night-run-2026-11-23", { tasks: [{ id: "8A.2cq", status: "done" }] }, { "8A.2cq": { checked: false, note: "not fixed" } });
  run(dir, "night-run-2026-11-24", { tasks: [{ id: "8A.2cq", status: "done", done: "Swipe clear of the preview." }] });
  settleAllRuns(dir, config);
  assert.deepEqual(ids(dir, "bug-done.json"), ["7 done"]);
});

test("the conversion puts ticked [x] items in the done file, and a run's review note brings one back", () => {
  const dir = project();
  put(tasks(dir, "small-fix.md"), [
    "# Small fixes",
    "",
    "## Tasks",
    "",
    "+ [x] **Tap cooldown: one default (8A.2cv).** _(owner, 2026-11-23)_ Text.",
    "+ [x] **AI board chip (8A.2cr).** _(owner, 2026-11-23)_ Text.",
    "+ [ ] **Still open (8A.2yy).** _(owner, 2026-11-23)_ Text.",
    "",
  ].join("\n"));
  run(dir, "night-run-2026-11-23", { tasks: [{ id: "8A.2cv", status: "done" }, { id: "8A.2cr", status: "done" }] },
    { "8A.2cr": { checked: false, note: "show only the relevant part" } });
  const report = convertProject(dir, { ...config, taskFiles: [{ file: "small-fix.md" }] });
  assert.deepEqual(report.settled.reopened.map((t) => t.title), ["AI board chip"]);
  assert.deepEqual(json(tasks(dir, "small-fix.json")).tasks.map((t) => [t.id, t.status]), [["8A.2yy", "open"], ["8A.2cr", "open"]]);
  assert.deepEqual(json(tasks(dir, "small-fix-done.json")).tasks.map((t) => [t.id, t.status]), [["8A.2cv", "done"]]);
});

test("no runs folder: nothing changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "task-review-none-"));
  assert.deepEqual(settleAllRuns(dir, config), { moved: [], reopened: [] });
  assert.equal(existsSync(join(dir, config.paths.tasks)), false);
});
