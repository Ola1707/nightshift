import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { loadConfig } from "./config.mjs";
import { allDecisions } from "./decisions.mjs";
import { parseRoadmap } from "./roadmaps.mjs";
import { pictureProblems, reportProblems, runPictures } from "./run-pictures.mjs";
import { DEMO_DIR, DEMO_RUN, SetupError, doctor, initProject, prepareDemo } from "./setup.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "nightshift-setup-"));
// A copy of the demo project to break; port 1 is never a board.
const demoCopy = () => {
  const dir = tmp();
  cpSync(DEMO_DIR, dir, { recursive: true });
  return dir;
};
const problems = (results) => results.filter((r) => !r.ok).map((r) => r.text);

test("init creates the files and folders from the defaults and prints one line each", () => {
  const dir = tmp();
  const lines = initProject(dir);
  assert.ok(lines.every((l) => /^(created|kept) /.test(l)));
  assert.ok(lines.includes("created board.config.json"));
  assert.ok(lines.includes("created docs/roadmap/night-run/bug.md"));
  assert.equal(readFileSync(join(dir, "docs/roadmap/night-run/bug.md"), "utf8"), "# Bugs\n\n## Tasks\n");
  assert.equal(readFileSync(join(dir, "docs/roadmap/night-run/next-night-run.md"), "utf8"), "# Next run\n");
  assert.ok(existsSync(join(dir, "docs/release-log")));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "docs/board/flow.json"), "utf8")), { types: {}, approved: {} });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "docs/board/plan-checklist.json"), "utf8")), { items: {}, added: [] });
  assert.deepEqual(loadConfig(dir).paths.tasks, "docs/roadmap/night-run");
});

test("init uses the answers and keeps files that exist", () => {
  const dir = tmp();
  initProject(dir, { answers: { owner: "Sam", taskFiles: [{ file: "bug.md", title: "Bugs" }] } });
  assert.equal(loadConfig(dir).owner, "Sam");
  assert.equal(existsSync(join(dir, "docs/roadmap/night-run/feature.md")), false);
  writeFileSync(join(dir, "docs/roadmap/night-run/bug.md"), "# Mine\n");
  const lines = initProject(dir, { force: true });
  assert.ok(lines.includes("kept docs/roadmap/night-run/bug.md"));
  assert.ok(lines.includes("kept docs/board/flow.json"));
  assert.equal(readFileSync(join(dir, "docs/roadmap/night-run/bug.md"), "utf8"), "# Mine\n");
  assert.equal(loadConfig(dir).owner, "you");
});

test("init refuses a second time without --force", () => {
  const dir = tmp();
  initProject(dir);
  assert.throws(() => initProject(dir), (e) => e instanceof SetupError && /already exists/.test(e.message));
});

test("init refuses answers that are not valid settings and writes nothing", () => {
  const dir = tmp();
  assert.throws(() => initProject(dir, { answers: { port: "x" } }), SetupError);
  assert.equal(existsSync(join(dir, "board.config.json")), false);
});

test("doctor passes on the demo project", async () => {
  const results = await doctor(DEMO_DIR, { port: 1 });
  assert.deepEqual(problems(results), []);
  assert.ok(results.some((r) => r.text === "OK 0 of 8 types approved"));
  assert.ok(results.some((r) => /^OK run night-run-2030-01-05/.test(r.text)));
});

test("doctor names a missing task file", async () => {
  const dir = demoCopy();
  rmSync(join(dir, "docs/roadmap/night-run/bug.md"));
  const found = problems(await doctor(dir, { port: 1 }));
  assert.equal(found.length, 1);
  assert.match(found[0], /^PROBLEM: task file docs\/roadmap\/night-run\/bug\.md does not exist\. /);
});

test("doctor names a missing picture", async () => {
  const dir = demoCopy();
  rmSync(join(dir, "docs/release-log", DEMO_RUN, "after/cart.png"));
  const found = problems(await doctor(dir, { port: 1 }));
  assert.equal(found.length, 1);
  assert.match(found[0], /picture for task B\.2 after is missing \(docs\/release-log\/night-run-2030-01-05\/after\/cart\.png\)/);
});

test("doctor reports a run.json that does not parse and a missing settings file", async () => {
  const dir = demoCopy();
  writeFileSync(join(dir, "docs/release-log", DEMO_RUN, "run.json"), "{");
  assert.match(problems(await doctor(dir, { port: 1 }))[0], /run\.json is not valid JSON/);
  const empty = tmp();
  assert.match(problems(await doctor(empty, { port: 1 }))[0], /board\.config\.json is missing/);
});

test("doctor says a port used by something else is a problem, and a free one is fine", async () => {
  const blocker = createServer().listen(0, "127.0.0.1");
  await new Promise((r) => blocker.once("listening", r));
  const { port } = blocker.address();
  try {
    const found = problems(await doctor(DEMO_DIR, { port }));
    assert.equal(found.length, 1);
    assert.match(found[0], new RegExp(`port ${port} is used by something that is not the board`));
  } finally {
    blocker.close();
  }
});

test("doctor --shots checks a suite's picture, skips one taken by the runner", async () => {
  const dir = demoCopy();
  const good = join(dir, "good.png");
  const blank = join(dir, "blank.png");
  await sharp(join(dir, "docs/release-log", DEMO_RUN, "after/home.png")).toFile(good);
  await sharp({ create: { width: 40, height: 40, channels: 3, background: "#ffffff" } }).png().toFile(blank);
  const config = JSON.parse(readFileSync(join(dir, "board.config.json"), "utf8"));
  config.suites = [
    { id: "web", run: "x", screenshot: { how: "playwright", viewport: "390x844" } },
    { id: "good", run: "x", screenshot: { command: `cat '${good}'` } },
    { id: "blank", run: "x", screenshot: { command: `cat '${blank}'` } },
    { id: "broken", run: "x", screenshot: { command: "exit 3" } },
  ];
  writeFileSync(join(dir, "board.config.json"), JSON.stringify(config));
  const results = await doctor(dir, { shots: true, port: 1 });
  const text = results.map((r) => r.text);
  assert.ok(text.includes("OK suite web: skipped: taken by the test runner"));
  assert.ok(text.some((t) => /^OK suite good: screenshot is not blank/.test(t)));
  assert.ok(text.some((t) => /^PROBLEM: suite blank: the screenshot is blank/.test(t)));
  assert.ok(text.some((t) => /^PROBLEM: suite broken: the command failed/.test(t)));
  assert.equal((await doctor(dir, { port: 1 })).some((r) => /suite/.test(r.text)), false);
});

test("the demo's run.json passes the same checks as a real one", async () => {
  const run = JSON.parse(readFileSync(join(DEMO_DIR, "docs/release-log", DEMO_RUN, "run.json"), "utf8"));
  assert.equal(runPictures(run).length, 4);
  assert.deepEqual(await pictureProblems(run, DEMO_DIR), {});
  assert.deepEqual(reportProblems(run, DEMO_DIR), {});
  const types = new Set(run.tasks.map((t) => t.type));
  assert.ok(types.size >= 3);
  assert.ok(allDecisions(run).length >= 2);
  assert.ok(run.failures.some((f) => f.fixedIn !== "not fixed"));
  assert.ok(run.proposed.length >= 1);
  const qa = JSON.parse(readFileSync(join(DEMO_DIR, "docs/release-log", DEMO_RUN, "qa.json"), "utf8"));
  assert.deepEqual(Object.keys(qa), ["T.1"]);
  assert.equal(qa["T.1"].checked, true);
  assert.equal(existsSync(join(DEMO_DIR, "docs/release-log", DEMO_RUN, "review.json")), false);
});

test("the demo has four open tasks in two task files and two roadmap phases", () => {
  const open = ["small-fix.md", "bug.md"].flatMap((f) =>
    parseRoadmap(readFileSync(join(DEMO_DIR, "docs/roadmap/night-run", f), "utf8"), f).flatMap((p) => p.tasks),
  );
  assert.equal(open.length, 4);
  const phases = parseRoadmap(readFileSync(join(DEMO_DIR, "docs/roadmap/bakery-plan.md"), "utf8"), "bakery-plan.md");
  assert.equal(phases.length, 2);
  assert.equal(loadConfig(DEMO_DIR).port, 8096);
});

test("the demo runs on a copy in the temp folder", () => {
  const copy = prepareDemo();
  assert.notEqual(copy, DEMO_DIR);
  assert.ok(copy.startsWith(tmpdir()) || copy.startsWith("/private"));
  assert.ok(existsSync(join(copy, "board.config.json")));
  rmSync(copy, { recursive: true, force: true });
});
