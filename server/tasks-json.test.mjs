import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import { convertProject, convertTaskFile, lostWords, nextTaskNumber, rawItems } from "./tasks-json.mjs";

const MD = `# Bugs

Something works wrong. See [next](next.md).

## Open

+ [ ] **Tap cooldown is wrong (8A.2cv).** _(Ola, 2026-11-23, from the review of day run 2026-11-12: "should be 5 s")_ Today it is 1 s. More text.
  - second line with \`code\`
- [x] **Done one (B.2).** _(done night run 2026-11-23: PR 4)_ _(owner, 2026-11-10; Ola answered later)_ Built.
- [ ] Plain item without bold. Then more words.
- [ ] ~~Dropped~~
`;

const PROMPTS = `# Prompts

### 8A.2c — Other task · Normal

stays here

### 8A.2cv — Tap cooldown · Normal

Do the thing.

\`\`\`
# not a heading
\`\`\`

### 8A.2cw — Next · Normal

stays too
`;

function project() {
  const dir = mkdtempSync(join(tmpdir(), "tasks-json-"));
  mkdirSync(join(dir, "docs/roadmap/night-run"), { recursive: true });
  writeFileSync(join(dir, "docs/roadmap/night-run/bug.md"), MD);
  writeFileSync(join(dir, "docs/roadmap/claude-code-prompts-app.md"), PROMPTS);
  return dir;
}

test("convertTaskFile splits the item and keeps every word", () => {
  const out = convertTaskFile(MD, { promptsByCode: { "8A.2cv": "P" } });
  assert.equal(out.title, "Bugs");
  assert.match(out.intro, /Something works wrong/);
  assert.deepEqual(
    out.tasks.map((t) => [t.id, t.status]),
    [["8A.2cv", "open"], ["B.2", "done"], ["plain-item-without-bold", "open"], ["dropped", "dropped"]],
  );
  const [first, done, plain] = out.tasks;
  assert.equal(first.title, "Tap cooldown is wrong");
  assert.deepEqual(first.asked, { by: "Ola", on: "2026-11-23", from: "from the review of day run 2026-11-12" });
  assert.equal(first.quote, "should be 5 s");
  assert.equal(first.prompt, "P");
  assert.match(first.details, /second line with `code`/);
  // a note that doesn't split cleanly stays in details
  assert.equal(done.asked, undefined);
  assert.match(done.details, /Ola answered later/);
  assert.match(done.details, /done night run 2026-11-23/);
  assert.match(plain.details, /Then more words/);
  rawItems(MD).forEach((raw, i) => assert.deepEqual(lostWords(raw, out.tasks[i]), []));
});

test("convertProject writes the JSON, moves the prompt, deletes the md", () => {
  const dir = project();
  const config = { ...loadConfig(dir), taskFiles: [{ file: "bug.md", title: "Bugs" }, { file: "nope.md", title: "N" }] };
  const report = convertProject(dir, config);
  assert.deepEqual(report.converted, ["bug.md"]);
  assert.equal(report.prompts, 1);
  assert.equal(report.skipped.length, 1);
  assert.deepEqual(report.lost, []);
  const night = join(dir, "docs/roadmap/night-run");
  assert.equal(existsSync(join(night, "bug.md")), false);
  const json = JSON.parse(readFileSync(join(night, "bug.json"), "utf8"));
  assert.deepEqual(json.tasks.map((t) => t.status), ["open", "open"]);
  const done = JSON.parse(readFileSync(join(night, "bug-done.json"), "utf8"));
  assert.equal(done.title, "Bugs (done)");
  assert.deepEqual(done.tasks.map((t) => [t.id, t.status]), [["B.2", "done"], ["dropped", "dropped"]]);
  assert.match(json.tasks[0].prompt, /^### 8A.2cv/);
  assert.match(json.tasks[0].prompt, /Do the thing/);
  assert.match(json.tasks[0].prompt, /# not a heading/);
  const prompts = readFileSync(join(dir, "docs/roadmap/claude-code-prompts-app.md"), "utf8");
  assert.doesNotMatch(prompts, /Do the thing/);
  assert.match(prompts, /stays here/);
  assert.match(prompts, /stays too/);
  // second run: the json exists, nothing changes
  assert.match(convertProject(dir, config).skipped[0], /already exists/);
});

test("a dry run with outDir leaves the project alone", () => {
  const dir = project();
  const out = mkdtempSync(join(tmpdir(), "tasks-json-out-"));
  const config = { ...loadConfig(dir), taskFiles: [{ file: "bug.md", title: "Bugs" }] };
  convertProject(dir, config, { outDir: out });
  assert.equal(existsSync(join(out, "bug.json")), true);
  assert.equal(existsSync(join(dir, "docs/roadmap/night-run/bug.md")), true);
  assert.match(readFileSync(join(dir, "docs/roadmap/claude-code-prompts-app.md"), "utf8"), /Do the thing/);
});

test("the converter numbers the tasks in file order, done files last, and nextTaskNumber goes on", () => {
  const dir = project();
  writeFileSync(join(dir, "docs/roadmap/night-run/small-fix.md"), "# Small\n\n- [ ] One thing.\n- [ ] Two thing.\n");
  const config = {
    ...loadConfig(dir),
    taskFiles: [{ file: "bug.md", title: "Bugs" }, { file: "small-fix.md", title: "Small" }],
  };
  assert.equal(nextTaskNumber(dir, config), 1);
  convertProject(dir, config);
  const night = join(dir, "docs/roadmap/night-run");
  const read = (f) => JSON.parse(readFileSync(join(night, f), "utf8")).tasks.map((t) => t.number);
  assert.deepEqual(read("bug.json"), [1, 2]);
  assert.deepEqual(read("small-fix.json"), [3, 4]);
  assert.deepEqual(read("bug-done.json"), [5, 6]);
  assert.equal(nextTaskNumber(dir, config), 7);
});
