import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "review-mode.mjs");

function repo(config) {
  const dir = mkdtempSync(join(tmpdir(), "review-mode-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  if (config) writeFileSync(join(dir, "board.config.json"), JSON.stringify(config));
  return dir;
}

function put(dir, rel, text = "x") {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}

function run(dir, mode, input) {
  const result = spawnSync("node", [script, mode], { input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

const flagOf = (dir) => existsSync(join(dir, ".git", "claude-review-mode"));
const edit = (dir, path) => run(dir, "pre", { tool_name: "Edit", tool_input: { file_path: path } });
const denied = (out) => out?.hookSpecificOutput?.permissionDecision === "deny";

for (const prompt of ["/nightshift:review-long-task", "/review-long-task some words"]) {
  test(`typed ${prompt} turns it on`, () => {
    const dir = repo();
    run(dir, "prompt", { prompt, hook_event_name: "UserPromptSubmit" });
    assert.ok(flagOf(dir));
  });
}

for (const command_name of ["nightshift:review-long-task", "review-long-task"]) {
  test(`command name ${command_name} turns it on`, () => {
    const dir = repo();
    run(dir, "prompt", { command_name, hook_event_name: "UserPromptExpansion" });
    assert.ok(flagOf(dir));
  });
}

test("the Skill tool loading either name turns it on", () => {
  for (const skill of ["nightshift:review-long-task", "review-long-task"]) {
    const dir = repo();
    run(dir, "pre", { tool_name: "Skill", tool_input: { skill } });
    assert.ok(flagOf(dir));
  }
});

test("review-done turns it off, both spellings", () => {
  for (const prompt of ["/nightshift:review-done", "/review-done"]) {
    const dir = repo();
    run(dir, "prompt", { prompt: "/review-long-task" });
    assert.ok(flagOf(dir));
    const out = run(dir, "prompt", { prompt });
    assert.ok(!flagOf(dir));
    assert.match(out.hookSpecificOutput.additionalContext, /OFF/);
  }
});

test("an unrelated prompt does nothing", () => {
  const dir = repo();
  assert.equal(run(dir, "prompt", { prompt: "hello" }), null);
  assert.ok(!flagOf(dir));
});

test("nothing is denied while off", () => {
  const dir = repo();
  assert.equal(edit(dir, join(dir, "src/app.js")), null);
});

test("a code edit is denied while on, naming the off command", () => {
  const dir = repo();
  run(dir, "prompt", { prompt: "/review-long-task" });
  const out = edit(dir, join(dir, "src/app.js"));
  assert.ok(denied(out));
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /\/nightshift:review-done/);
});

test("a .md edit and a docs/ edit are allowed while on", () => {
  const dir = repo();
  run(dir, "prompt", { prompt: "/review-long-task" });
  assert.equal(edit(dir, join(dir, "notes/README.md")), null);
  assert.equal(edit(dir, join(dir, "docs/data.json")), null);
});

test("an alsoGuard folder: code denied, .md and plugin/skills/ allowed, outside both allowed", () => {
  const other = repo();
  const dir = repo({ reviewMode: { alsoGuard: [other] } });
  const relative = repo({ reviewMode: { alsoGuard: ["../does-not-exist-sibling"] } });
  run(dir, "prompt", { prompt: "/review-long-task" });
  assert.ok(denied(edit(dir, join(other, "lib/a.mjs"))));
  assert.equal(edit(dir, join(other, "README.md")), null);
  assert.equal(edit(dir, join(other, "plugin/skills/x/SKILL.md")), null);
  assert.equal(edit(dir, join(other, "plugin/skills/x/helper.mjs")), null);
  assert.equal(edit(dir, join(tmpdir(), "somewhere-else/file.js")), null);
  run(relative, "prompt", { prompt: "/review-long-task" });
  assert.equal(edit(relative, join(tmpdir(), "elsewhere.js")), null);
});

test("a relative alsoGuard folder is resolved against the project", () => {
  const parent = mkdtempSync(join(tmpdir(), "review-mode-parent-"));
  const dir = join(parent, "project");
  const other = join(parent, "other");
  mkdirSync(dir);
  mkdirSync(other);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, "board.config.json"), JSON.stringify({ reviewMode: { alsoGuard: ["../other"] } }));
  run(dir, "prompt", { prompt: "/review-long-task" });
  assert.ok(denied(edit(dir, join(other, "a.js"))));
});

test("post reports a code file changed since the snapshot, then stays quiet", () => {
  const dir = repo();
  put(dir, "before.js");
  run(dir, "prompt", { prompt: "/review-long-task" });
  assert.equal(run(dir, "post", { tool_name: "Bash" }), null);
  put(dir, "after.js");
  const out = run(dir, "post", { tool_name: "Bash" });
  assert.equal(out.decision, "block");
  assert.match(out.reason, /after\.js/);
  assert.doesNotMatch(out.reason, /before\.js/);
  assert.equal(run(dir, "post", { tool_name: "Bash" }), null);
});

test("post ignores a Markdown change", () => {
  const dir = repo();
  run(dir, "prompt", { prompt: "/review-long-task" });
  put(dir, "notes.md");
  assert.equal(run(dir, "post", { tool_name: "Bash" }), null);
});
