import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "nightshift.mjs");

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "nightshift-bin-"));
  for (const [file, data] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), typeof data === "string" ? data : JSON.stringify(data));
  }
  return dir;
}

// Runs the command in the project folder; NIGHTSHIFT_DEV_DIR is cleared unless the test sets it.
const run = (dir, args, { input, env = {} } = {}) =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd: dir,
    env: { ...process.env, BOARD_PROJECT: "", NIGHTSHIFT_DEV_DIR: "", ...env },
    input,
    encoding: "utf8",
  });

test("config prints the merged settings of the folder it is run in", () => {
  const dir = project({ "board.config.json": { owner: "Sam" } });
  const out = run(dir, ["config"]);
  assert.equal(out.status, 0, out.stderr);
  const config = JSON.parse(out.stdout);
  assert.equal(config.owner, "Sam");
  assert.equal(config.port, 8095);
});

test("BOARD_PROJECT names another project folder", () => {
  const other = project({ "board.config.json": { owner: "Corner Bakery" } });
  const out = run(project(), ["config"], { env: { BOARD_PROJECT: other } });
  assert.equal(JSON.parse(out.stdout).owner, "Corner Bakery");
});

test("flow <id> prints one merged type; an unknown id fails", () => {
  const dir = project({
    "docs/board/flow.json": { types: { bug: { title: "Defect", steps: [{ who: "human", text: "sees it" }] } } },
  });
  const out = run(dir, ["flow", "bug"]);
  assert.equal(out.status, 0, out.stderr);
  const bug = JSON.parse(out.stdout);
  assert.equal(bug.id, "bug");
  assert.equal(bug.title, "Defect");
  assert.equal(bug.approved, false);
  assert.ok(Array.isArray(JSON.parse(run(dir, ["flow"]).stdout).types));
  assert.equal(run(dir, ["flow", "nope"]).status, 1);
});

const SAMPLE = [
  "Plan checklist choices",
  "Owner approves: Edge cases; Security",
  "Claude does: Logs; Rollback; No such item",
  "Both: Cost",
].join("\n");

test("checklist-import reads stdin; checklist prints the three lists", () => {
  const dir = project();
  const imported = run(dir, ["checklist-import"], { input: SAMPLE });
  assert.equal(imported.status, 0, imported.stderr);
  assert.match(imported.stdout, /Changed \d+ items?\./);
  assert.match(imported.stdout, /Skipped, unknown name: No such item/);
  const printed = JSON.parse(run(dir, ["checklist"]).stdout);
  assert.deepEqual(Object.keys(printed), ["approve", "claude", "both"]);
  assert.deepEqual(printed.both.map((i) => i.name), ["Cost"]);
  assert.equal(run(dir, ["checklist-import"], { input: "something else" }).status, 1);
});

test("an unknown command prints the usage and exits 2", () => {
  const out = run(project(), ["bogus"]);
  assert.equal(out.status, 2);
  assert.match(out.stderr, /Usage: nightshift/);
});

test("NIGHTSHIFT_DEV_DIR runs the other copy; this copy's own folder is not run twice", () => {
  const dev = project({
    "bin/nightshift.mjs": 'console.log("dev copy " + process.argv.slice(2).join(" "));\n',
  });
  const out = run(project(), ["config", "x"], { env: { NIGHTSHIFT_DEV_DIR: dev } });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), "dev copy config x");

  const self = join(dirname(BIN), "..");
  const same = run(project({ "board.config.json": { owner: "Sam" } }), ["config"], {
    env: { NIGHTSHIFT_DEV_DIR: self },
  });
  assert.equal(JSON.parse(same.stdout).owner, "Sam");
  // A folder without bin/nightshift.mjs is ignored.
  assert.equal(run(project(), ["config"], { env: { NIGHTSHIFT_DEV_DIR: project() } }).status, 0);
});

test("updates lists the open ones; update --skip records the answer", () => {
  const dir = project({ "board.config.json": {} });
  const listed = run(dir, ["updates"]);
  assert.equal(listed.status, 0);
  assert.match(listed.stdout, /^tasks-json: Task files as JSON\./);
  const skipped = run(dir, ["update", "tasks-json", "--skip"]);
  assert.equal(skipped.status, 0);
  assert.equal(run(dir, ["updates"]).stdout, "");
  assert.equal(run(dir, ["update", "nope"]).status, 1);
});
