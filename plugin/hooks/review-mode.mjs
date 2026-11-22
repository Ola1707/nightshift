#!/usr/bin/env node
// Review mode: while the owner reviews a run, Claude may change docs, Markdown files and skills, never code.
// The harness enforces it, not Claude's judgment.
//   on:  /nightshift:start-review or /start-review (typed, a command, or the Skill tool loading it)
//   off: /nightshift:review-done or /review-done
// The flag lives in .git/claude-review-mode (never tracked). It holds a snapshot of the code files that were already
// changed when review mode started, so only new code changes are reported.
//
// Optional <project>/board.config.json: { "reviewMode": { "alsoGuard": ["../other-repo"] } }. Each folder (absolute,
// or relative to the project) is guarded too: inside it only .md files and files under plugin/skills/ are editable.
//
// Modes (first argument):
//   prompt  UserPromptSubmit / UserPromptExpansion: turns review mode on or off
//   pre     PreToolUse: denies Edit/Write/NotebookEdit on code files; the Skill tool loading the review skill turns it on
//   post    PostToolUse: after any tool (Bash included), reports code files that changed since the snapshot

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";

/** Absolute path with symlinks resolved, also for a file that does not exist yet (/var vs /private/var on macOS). */
function real(path) {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    const parent = dirname(absolute);
    return parent === absolute ? absolute : join(real(parent), basename(absolute));
  }
}

const root = real(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const flag = join(root, ".git", "claude-review-mode");

const ON_NAMES = ["nightshift:start-review", "start-review"];
const OFF_NAMES = ["nightshift:review-done", "review-done"];

function guardedFolders() {
  try {
    const config = JSON.parse(readFileSync(join(root, "board.config.json"), "utf8"));
    const list = config?.reviewMode?.alsoGuard;
    if (!Array.isArray(list)) return [];
    return list.filter((item) => typeof item === "string" && item).map((item) => real(resolve(root, item)));
  } catch {
    return [];
  }
}

const guarded = guardedFolders();

function inside(folder, absolute) {
  const rel = relative(folder, absolute);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)) ? rel : null;
}

function isMarkdown(path) {
  return path.toLowerCase().endsWith(".md");
}

/** Project: docs, skills and Markdown stay editable. alsoGuard folders: only Markdown and plugin/skills/. Everything else is editable. */
function allowed(path) {
  const absolute = real(resolve(root, path));
  for (const folder of guarded) {
    const rel = inside(folder, absolute);
    if (rel !== null) return isMarkdown(rel) || rel.startsWith("plugin/skills/");
  }
  const rel = inside(root, absolute);
  if (rel === null) return true;
  return rel.startsWith("docs/") || rel.startsWith(".claude/skills/") || isMarkdown(rel);
}

function hash(absolute) {
  try {
    return createHash("sha1").update(readFileSync(absolute)).digest("hex");
  } catch {
    return "deleted";
  }
}

function gitFiles(dir) {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" }).trim();
    // top is already real
    const out = execFileSync("git", ["status", "--porcelain", "-uall", "-z"], { cwd: top, encoding: "utf8" });
    const files = [];
    const entries = out.split("\0");
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.length < 4) continue;
      files.push(join(top, entry.slice(3)));
      if (entry[0] === "R" || entry[0] === "C") i++; // skip the original name of a rename
    }
    return files;
  } catch {
    return [];
  }
}

/** Changed or new code files in the working tree (project and guarded folders), with a hash of each. */
function changedCode() {
  const files = {};
  const seen = new Set();
  for (const dir of [root, ...guarded]) {
    for (const absolute of gitFiles(dir)) {
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      if (inside(root, absolute) === null && !guarded.some((folder) => inside(folder, absolute) !== null)) continue;
      if (!allowed(absolute)) files[absolute] = hash(absolute);
    }
  }
  return files;
}

function turnOn() {
  writeFileSync(flag, JSON.stringify({ since: new Date().toISOString(), snapshot: changedCode() }));
}

function show(absolute) {
  return inside(root, absolute) ?? absolute;
}

function emit(object) {
  process.stdout.write(JSON.stringify(object));
}

const mode = process.argv[2];
const input = JSON.parse(readFileSync(0, "utf8") || "{}");

function typed(text, names) {
  return names.some((name) => text === `/${name}` || text.startsWith(`/${name} `) || text.startsWith(`/${name}\n`));
}

if (mode === "prompt") {
  const text = String(input.prompt ?? "").trim();
  const command = String(input.command_name ?? input.command ?? "").replace(/^\//, "");
  if (typed(text, ON_NAMES) || ON_NAMES.includes(command)) {
    if (!existsSync(flag)) turnOn();
    emit({ hookSpecificOutput: { hookEventName: input.hook_event_name ?? "UserPromptSubmit", additionalContext: "Review mode is ON: code edits are blocked by a hook; docs, Markdown and skills stay editable. /nightshift:review-done turns it off." } });
  } else if (typed(text, OFF_NAMES) || OFF_NAMES.includes(command)) {
    rmSync(flag, { force: true });
    emit({ hookSpecificOutput: { hookEventName: input.hook_event_name ?? "UserPromptSubmit", additionalContext: "Review mode is OFF: code edits are allowed again." } });
  }
} else if (mode === "pre") {
  const skill = String(input.tool_input?.skill ?? "");
  if (input.tool_name === "Skill" && ON_NAMES.includes(skill)) {
    if (!existsSync(flag)) turnOn();
  } else if (input.tool_name === "Skill" && OFF_NAMES.includes(skill)) {
    rmSync(flag, { force: true });
  } else if (existsSync(flag)) {
    const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    if (typeof path === "string" && !allowed(path)) {
      emit({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Review mode is on: ${show(real(resolve(root, path)))} is code. Add the change to the roadmap instead (docs, Markdown and skills stay editable). The owner turns review mode off with /nightshift:review-done.`,
        },
      });
    }
  }
} else if (mode === "post") {
  if (existsSync(flag)) {
    const state = JSON.parse(readFileSync(flag, "utf8"));
    const now = changedCode();
    const touched = Object.keys(now).filter((path) => state.snapshot[path] !== now[path]);
    if (touched.length > 0) {
      writeFileSync(flag, JSON.stringify({ ...state, snapshot: now }));
      const list = touched.map(show).join(", ");
      emit({
        decision: "block",
        reason: `Review mode is on, but this tool call changed code: ${list}. Tell the owner right away and do not change code again; add tasks to the roadmap instead.`,
        systemMessage: `Review mode: code changed during the review: ${list}`,
      });
    }
  }
}
