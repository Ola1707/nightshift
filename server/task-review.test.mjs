import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { saveReview } from "./runs.mjs";
import { convertProject } from "./tasks-json.mjs";
import { settleReviewedRuns, settleTasks, verdict } from "./task-review.mjs";

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
const task = (number, id, title, status = "built") => ({ number, id, title, status, details: "", reviews: [] });

function run(dir, name, runJson, qa, reviewDone = true) {
  const folder = join(dir, config.paths.runs, name);
  mkdirSync(folder, { recursive: true });
  put(join(folder, "run.json"), runJson);
  if (qa) put(join(folder, "qa.json"), qa);
  if (reviewDone) put(join(folder, "review.json"), { done: true, at: "2026-11-23T20:35:51.448Z" });
}

test("verdict: a tick accepts, a note without a tick rejects, a done task with no note is accepted", () => {
  assert.equal(verdict({ status: "partial" }, { checked: true }), "accepted");
  assert.equal(verdict({ status: "done" }, { checked: false, note: "that wasn't the plan" }), "rejected");
  assert.equal(verdict({ status: "done" }, undefined), "accepted");
  assert.equal(verdict({ status: "partial" }, undefined), null);
  assert.equal(verdict({ status: "not-done" }, { checked: false, note: "  " }), null);
});

test("Review done moves accepted tasks to the done file and sends rejected ones back to open with the note", () => {
  const dir = project();
  put(tasks(dir, "small-fix.json"), {
    title: "Small fixes",
    tasks: [
      task(1, "8A.2cr", "AI board: a task that isn't done stands out"),
      task(2, "8A.2cs", "Admin Versions: the Local row stays visible"),
      task(3, "8A.2cv", "Tap cooldown: one default"),
      task(4, "other", "Not in this run", "open"),
    ],
  });
  run(dir, "night-run-2026-11-23", {
    tasks: [
      { id: "8A.2cr", title: "AI board", status: "done", done: "Chip added." },
      { id: "8A.2cs", title: "Admin Versions", status: "done", done: "Sticky cell.\nMore." },
      { id: "8A.2cv", title: "Tap cooldown", status: "done", done: "One default." },
    ],
  }, { "8A.2cr": { checked: false, note: "show only the relevant part" }, "8A.2cs": { checked: true, note: "" } }, false);
  const review = saveReview({
    repo: dir,
    runsDir: join(dir, config.paths.runs),
    name: "night-run-2026-11-23",
    done: true,
    now: new Date("2026-11-23T11:04:53Z"),
    config,
  });
  assert.deepEqual(review.settled.moved.map((t) => t.number), [2, 3]);
  assert.deepEqual(review.settled.reopened, [{ number: 1, title: "AI board: a task that isn't done stands out", note: "show only the relevant part" }]);
  const open = json(tasks(dir, "small-fix.json")).tasks;
  assert.deepEqual(open.map((t) => [t.number, t.status]), [[1, "open"], [4, "open"]]);
  assert.deepEqual(open[0].reviews, [{ on: "2026-11-23", run: "night-run-2026-11-23", accepted: false, note: "show only the relevant part" }]);
  const done = json(tasks(dir, "small-fix-done.json"));
  assert.equal(done.title, "Small fixes (done)");
  assert.deepEqual(done.tasks.map((t) => [t.number, t.status]), [[2, "done"], [3, "done"]]);
  assert.deepEqual(done.tasks[0].done, { on: "2026-11-23", in: "night-run-2026-11-23", evidence: "Sticky cell." });
  assert.deepEqual(done.tasks[0].reviews, [{ on: "2026-11-23", run: "night-run-2026-11-23", accepted: true }]);
  // The review.json on disk stays { done, at }.
  assert.deepEqual(Object.keys(json(join(dir, config.paths.runs, "night-run-2026-11-23", "review.json"))), ["done", "at"]);
});

test("a run task matches its JSON task by title when the ids differ, and reopening a review moves nothing", () => {
  const dir = project();
  put(tasks(dir, "bug.json"), { title: "Bugs", tasks: [task(4, "keyboard-scrolling-a-form", "**Keyboard: scrolling a form doesn't close the keyboard (P2).**")] });
  run(dir, "day-run-2026-11-23", { tasks: [{ id: "keyboard-scroll", title: "Keyboard: scrolling a form doesn't close the keyboard", status: "done" }] }, {}, false);
  const runsDir = join(dir, config.paths.runs);
  const reopened = saveReview({ repo: dir, runsDir, name: "day-run-2026-11-23", done: false, config });
  assert.equal(reopened.settled, undefined);
  assert.equal(json(tasks(dir, "bug.json")).tasks.length, 1);
  saveReview({ repo: dir, runsDir, name: "day-run-2026-11-23", done: true, config });
  assert.equal(json(tasks(dir, "bug.json")).tasks.length, 0);
  assert.equal(json(tasks(dir, "bug-done.json")).tasks[0].number, 4);
  // Pressing Review done again doesn't add the task twice.
  saveReview({ repo: dir, runsDir, name: "day-run-2026-11-23", done: true, config });
  assert.equal(json(tasks(dir, "bug-done.json")).tasks.length, 1);
});

test("settleTasks leaves a partial task with no tick open, and a done task already in the done file alone", () => {
  const dir = project();
  put(tasks(dir, "bug.json"), { title: "Bugs", tasks: [task(23, "emulator-boot", "Emulator boots", "open")] });
  const r = settleTasks(dir, config, { run: { tasks: [{ id: "emulator-boot", status: "partial" }] }, qa: {}, runName: "n" });
  assert.deepEqual(r, { moved: [], reopened: [] });
  assert.equal(existsSync(tasks(dir, "bug-done.json")), false);
});

test("the conversion settles [x] items whose run review is done; the newest review decides", () => {
  const dir = project();
  put(tasks(dir, "small-fix.md"), [
    "# Small fixes",
    "",
    "## Tasks",
    "",
    "+ [x] **Tap cooldown: one default (8A.2cv).** _(owner, 2026-11-23)_ Text.",
    "+ [x] **Test 5 holds a wait (8A.2dd).** _(owner, 2026-11-23)_ Text.",
    "+ [x] **Not reviewed yet (8A.2zz).** _(owner, 2026-11-23)_ Text.",
    "+ [ ] **Still open (8A.2yy).** _(owner, 2026-11-23)_ Text.",
    "",
  ].join("\n"));
  run(dir, "night-run-2026-11-22", { tasks: [{ id: "8A.2dd", status: "done" }] }, {});
  run(dir, "night-run-2026-11-23", { tasks: [{ id: "8A.2cv", status: "done" }, { id: "8A.2dd", status: "done" }, { id: "8A.2yy", status: "done" }] },
    { "8A.2dd": { checked: false, note: "60 s is too long" } });
  run(dir, "night-run-2026-11-24", { tasks: [{ id: "8A.2zz", status: "done" }] }, {}, false);
  const report = convertProject(dir, { ...config, taskFiles: [{ file: "small-fix.md" }] });
  // 8A.2dd: the newer run rejected it, so the older acceptance doesn't move it; 8A.2zz's run isn't reviewed yet;
  // 8A.2yy was never ticked ([ ]), so the conversion leaves it open.
  assert.deepEqual(report.settled.moved.map((t) => t.title), ["Tap cooldown: one default"]);
  assert.deepEqual(report.settled.reopened.map((t) => t.note), ["60 s is too long"]);
  const open = json(tasks(dir, "small-fix.json")).tasks;
  assert.deepEqual(open.map((t) => [t.id, t.status]), [["8A.2dd", "open"], ["8A.2zz", "built"], ["8A.2yy", "open"]]);
  assert.deepEqual(json(tasks(dir, "small-fix-done.json")).tasks.map((t) => t.id), ["8A.2cv"]);
});

test("settleReviewedRuns with no runs folder changes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "task-review-none-"));
  assert.deepEqual(settleReviewedRuns(dir, config), { moved: [], reopened: [] });
});
