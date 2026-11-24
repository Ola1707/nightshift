import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import { parseRoadmap, parseTaskJson, readRoadmaps, sortPhases, sortRoadmapFiles } from "./roadmaps.mjs";

const defaultOrder = ["roadmap-launch.md", "roadmap-ops.md", "roadmap-shop.md"];

const md = `# Corner Bakery Roadmap — Example

# Phase 2 — Delivery [Native build]

## Tasks

+ [ ] **Bug: the keyboard hides the buttons (B.2).** _(owner, 2030-01-03)_ Seen in the order form.
- [ ] Plain task without a prompt. More words.
- [ ] Slow "9." (checkout): hasn't run. Then more.
- [x] Done task
- [ ] ~~Dropped task~~

### T.3 Order form

+ [ ] First sub-task
+ [ ] Second sub-task

\`\`\`
- [ ] inside a code block
\`\`\`

# Phase 3 — Empty

- [x] all done
`;

test("open tasks grouped by phase, with prompt marks and codes", () => {
  const phases = parseRoadmap(md, "roadmap-x.md");
  assert.deepEqual(
    phases.map((p) => p.name),
    ["Phase 2 — Delivery [Native build]"],
  );
  const [bug, plainTask, slow, first, second] = phases[0].tasks;
  assert.equal(phases[0].tasks.length, 5);
  assert.equal(slow.title, 'Slow "9." (checkout): hasn\'t run');
  assert.equal(bug.title, "Bug: the keyboard hides the buttons (B.2)");
  assert.equal(bug.code, "B.2");
  assert.equal(bug.hasPrompt, true);
  assert.match(bug.details, /Seen in the order form/);
  assert.equal(plainTask.title, "Plain task without a prompt");
  assert.equal(plainTask.hasPrompt, false);
  assert.equal(first.code, "T.3");
  assert.equal(first.section, "T.3 Order form");
  assert.notEqual(first.id, second.id);
});

test("a file with one title groups by its ## sections", () => {
  const phases = parseRoadmap(
    "# Title\n\n## T.1 — Web suite\n\n- [ ] A workflow\n",
    "roadmap-ci.md",
  );
  assert.equal(phases[0].name, "T.1 — Web suite");
  assert.equal(phases[0].tasks[0].title, "A workflow");
});

test("roadmaps follow the saved order, then the default order, then A–Z", () => {
  const files = ["roadmap-x.md", "roadmap-ops.md", "roadmap-shop.md", "roadmap-launch.md"];
  assert.deepEqual(sortRoadmapFiles(files, [], defaultOrder), [
    "roadmap-launch.md",
    "roadmap-ops.md",
    "roadmap-shop.md",
    "roadmap-x.md",
  ]);
  assert.deepEqual(sortRoadmapFiles(files, ["roadmap-shop.md"], defaultOrder), [
    "roadmap-shop.md",
    "roadmap-launch.md",
    "roadmap-ops.md",
    "roadmap-x.md",
  ]);
});

test("phases follow the saved order; phases not in it keep their place after", () => {
  const phases = ["A", "B", "C", "D"].map((name) => ({ name, tasks: [] }));
  assert.deepEqual(
    sortPhases(phases, ["C", "A", "gone"]).map((p) => p.name),
    ["C", "A", "B", "D"],
  );
});

test("readRoadmaps takes task files and roadmap rules from the config; a missing task file is empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "roadmaps-"));
  mkdirSync(join(dir, "night-run"));
  writeFileSync(join(dir, "night-run", "bug.md"), "# Bugs\n\n- [ ] A bug\n");
  writeFileSync(join(dir, "roadmap-a.md"), "# Bakery Roadmap — Alpha\n\n## One\n\n- [ ] Task\n");
  writeFileSync(join(dir, "roadmap-skip.md"), "# Skip\n\n## One\n\n- [ ] Task\n");
  writeFileSync(join(dir, "notes.md"), "# Notes\n\n## One\n\n- [ ] Task\n");
  const config = loadConfig(dir);
  config.roadmaps = {
    pattern: "^roadmap(-.+)?\\.md$",
    exclude: ["roadmap-skip.md"],
    order: [],
    titlePrefix: "^Bakery Roadmap — ",
  };
  const { night, other } = readRoadmaps(dir, {}, config);
  assert.deepEqual(
    night.map((n) => [n.file, n.tasks.length, n.planOnly]),
    [
      ["night-run/small-fix.md", 0, false],
      ["night-run/bug.md", 1, false],
      ["night-run/visual-change.md", 0, false],
      ["night-run/feature.md", 0, false],
      ["night-run/big-feature.md", 0, false],
      ["night-run/infrastructure.md", 0, true],
    ],
  );
  assert.deepEqual(
    other.map((r) => [r.file, r.title]),
    [["roadmap-a.md", "Alpha"]],
  );
});

test("a JSON task file wins over the Markdown one and keeps the board's task shape", () => {
  const dir = mkdtempSync(join(tmpdir(), "roadmaps-json-"));
  mkdirSync(join(dir, "night-run"));
  writeFileSync(join(dir, "night-run", "bug.md"), "# Bugs\n\n- [ ] Markdown bug\n");
  writeFileSync(
    join(dir, "night-run", "bug.json"),
    JSON.stringify({
      title: "Bugs",
      intro: "",
      tasks: [
        {
          id: "B.1",
          title: "Json bug",
          status: "built",
          asked: { by: "Ola", on: "2030-01-01" },
          details: "What is wrong",
          doneWhen: "a test",
          textOnly: true,
          impact: { cpu: { effect: "none" } },
          prompt: "do it",
        },
        { id: "B.2", title: "Dropped", status: "dropped" },
        { id: "B.3", title: "No prompt" },
      ],
    }),
  );
  writeFileSync(join(dir, "night-run", "feature.md"), "# F\n\n+ [ ] **Md feature (F.1).** More\n");
  const config = {
    ...loadConfig(dir),
    taskFiles: [
      { file: "bug.md", title: "Bugs" },
      { file: "feature.md", title: "Features" },
    ],
  };
  const { night } = readRoadmaps(dir, {}, config);
  assert.equal(night[0].file, "night-run/bug.json");
  assert.equal(night[0].tasks.length, 2);
  const [task, plain] = night[0].tasks;
  assert.equal(task.code, "B.1");
  assert.equal(task.hasPrompt, true);
  assert.equal(plain.hasPrompt, false);
  assert.equal(plain.status, "open");
  assert.equal(task.source, "json");
  assert.equal(task.phase, "Tasks");
  assert.equal(task.section, null);
  assert.equal(task.id, "night-run/bug.json#B.1/Json bug");
  assert.equal(task.status, "built");
  assert.equal(task.textOnly, true);
  assert.deepEqual(task.impact, { cpu: { effect: "none" } });
  assert.equal(task.asked.by, "Ola");
  assert.equal(task.doneWhen, "a test");
  assert.equal("prompt" in task, false);
  // Markdown stays as it was
  assert.equal(night[1].file, "night-run/feature.md");
  assert.equal(night[1].tasks[0].code, "F.1");
  assert.equal("source" in night[1].tasks[0], false);
});

test("a JSON task returns its number, a hand-written one without a number returns none", () => {
  const tasks = parseTaskJson(
    { tasks: [{ id: "A.1", number: 7, title: "With number" }, { id: "A.2", title: "Without" }] },
    "night-run/bug.json",
  );
  assert.equal(tasks[0].number, 7);
  assert.equal("number" in tasks[1], false);
});
