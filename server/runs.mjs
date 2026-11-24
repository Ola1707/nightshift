// Saving "Review done" (or reopening it) for a run folder. Deploys to the held environments wait for it
// (review-gate.mjs); open decisions never do: they only carry over to the pick page.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeReview } from "./release-log.mjs";
import { settleTasks } from "./task-review.mjs";

const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;

/**
 * Writes the run's review.json and, when done, the "## Review" section of each release log in run.json "deploys[].log".
 * With `config` (JSON task files), Review done also settles the run's tasks: accepted ones move to the done file,
 * rejected ones go back to "open" with the note (task-review.mjs). Reopening the review moves nothing back.
 * @param {{ repo: string, runsDir: string, runsPath?: string, name: string, done: boolean, now?: Date, config?: object }} options
 * @returns {{ done: boolean, at: string, settled?: object }} the saved review (settled: what moved, not saved)
 */
export function saveReview({
  repo,
  runsDir,
  runsPath = "docs/release-log",
  name,
  done,
  now = new Date(),
  config,
}) {
  if (!/^[\w.-]+$/.test(name)) throw new Error("bad run name");
  const folder = join(runsDir, name);
  const review = { done: Boolean(done), at: now.toISOString() };
  writeFileSync(join(folder, "review.json"), JSON.stringify(review, null, 2) + "\n");
  if (!review.done) return review;
  const run = readJson(join(folder, "run.json"), { tasks: [] });
  const qa = readJson(join(folder, "qa.json"), {});
  const escaped = runsPath.replace(/\/+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const logPath = new RegExp(`^${escaped}/[\\w.-]+\\.md$`);
  for (const { log } of run.deploys ?? []) {
    if (!log || !logPath.test(log)) continue;
    const file = join(repo, log);
    if (existsSync(file))
      writeFileSync(file, writeReview(readFileSync(file, "utf8"), run, qa, review.at));
  }
  if (!config?.taskFiles) return review;
  return { ...review, settled: settleTasks(repo, config, { run, qa, runName: name, at: review.at }) };
}
