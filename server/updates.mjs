// Updates a new Nightshift version offers (defaults/updates.json); the owner answers each one:
// applied or skipped, saved in board.config.json -> "updates": { "<id>": "applied" | "skipped" }.
//   nightshift updates              the ones not answered yet
//   nightshift update <id> [--skip] applies one (or skips it) and records the answer
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertProject } from "./tasks-json.mjs";

export const DEFAULT_UPDATES = join(dirname(fileURLToPath(import.meta.url)), "..", "defaults", "updates.json");

const APPLY = {
  "tasks-json": (projectDir, config) => convertProject(projectDir, config),
};

const fill = (text, config) => text.replace("<paths.tasks>", config.paths.tasks);

/** All updates, `changes` with the project's paths filled in. */
export function readUpdates(config, file = DEFAULT_UPDATES) {
  return JSON.parse(readFileSync(file, "utf8")).map((u) => ({ ...u, changes: u.changes.map((c) => fill(c, config)) }));
}

/** The updates not answered yet in config.updates. */
export const pendingUpdates = (config, file) => readUpdates(config, file).filter((u) => !config.updates[u.id]);

// Writes only the user's own board.config.json, not the merged settings.
function saveAnswer(projectDir, id, answer) {
  const path = join(projectDir, "board.config.json");
  const own = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  own.updates = { ...own.updates, [id]: answer };
  writeFileSync(path, JSON.stringify(own, null, 2) + "\n");
}

/** Applies (or with skip: only skips) one update and records the answer. Returns { answer, report? }. */
export function runUpdate(projectDir, config, id, { skip = false, file } = {}) {
  if (!readUpdates(config, file).some((u) => u.id === id)) throw new Error(`No update "${id}".`);
  if (skip) {
    saveAnswer(projectDir, id, "skipped");
    return { answer: "skipped" };
  }
  const report = APPLY[id](projectDir, config);
  saveAnswer(projectDir, id, "applied");
  return { answer: "applied", report };
}
