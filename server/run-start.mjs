// When a run started: run.json "started" (ISO time) when the run wrote it, else the first commit of the run's plan file
// (<paths.tasks>/<run folder name>.md, committed as the run starts), else null. Day runs and a second run on the same
// day (…-2) get their own time, so the board can tell them apart.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const cache = new Map();

/** The first commit time (ISO, with offset) of `file` in `repo`, or null. */
function firstCommit(repo, file) {
  try {
    const out = execFileSync("git", ["-C", repo, "log", "--diff-filter=A", "--follow", "--format=%aI", "--", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out.split("\n").filter(Boolean).at(-1) ?? null;
  } catch {
    return null;
  }
}

/** @returns {string | null} the run's start time, ISO with offset */
export function runStarted(repo, config, name, run) {
  if (typeof run?.started === "string" && !Number.isNaN(Date.parse(run.started))) return run.started;
  if (!/^[\w.-]+$/.test(name)) return null;
  if (cache.has(name)) return cache.get(name);
  const plan = join(config.paths.tasks, `${name}.md`);
  const started = existsSync(join(repo, plan)) ? firstCommit(repo, plan) : null;
  if (started) cache.set(name, started); // an uncommitted plan gets its time once it is committed
  return started;
}
