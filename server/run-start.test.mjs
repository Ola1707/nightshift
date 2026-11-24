import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runStarted } from "./run-start.mjs";

const config = { paths: { tasks: "docs/roadmap/night-run" } };
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "run-start-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  mkdirSync(join(dir, config.paths.tasks), { recursive: true });
  return dir;
}

test("run.json started wins", () => {
  assert.equal(runStarted("/nowhere", config, "day-run-2026-11-24", { started: "2026-11-24T10:05:00+02:00" }), "2026-11-24T10:05:00+02:00");
});

test("without it: the first commit of the run's plan file; a later edit doesn't move it", () => {
  const dir = repo();
  const plan = join(dir, config.paths.tasks, "night-run-2026-11-23-2.md");
  writeFileSync(plan, "plan\n");
  git(dir, "add", "-A");
  execFileSync("git", ["-C", dir, "commit", "-qm", "plan"], { env: { ...process.env, GIT_AUTHOR_DATE: "2026-11-23T14:10:07+02:00" } });
  writeFileSync(plan, "plan, edited\n");
  git(dir, "commit", "-qam", "edit");
  assert.equal(runStarted(dir, config, "night-run-2026-11-23-2", {}), "2026-11-23T14:10:07+02:00");
});

test("no plan file, or a bad name: null", () => {
  const dir = repo();
  assert.equal(runStarted(dir, config, "day-run-2026-11-23", {}), null);
  assert.equal(runStarted(dir, config, "../x", {}), null);
  assert.equal(runStarted(dir, config, "night-run-x", { started: "not a time" }), null);
});
