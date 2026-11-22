// No deploy to a held environment while a night or day run waits for the owner's review.
// A run is a <runs folder>/<run>/ folder with a run.json; the board's "Review done" button writes review.json
// next to it. Deploy scripts call reviewGateProblem and stop when it returns a reason.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The run folders under runsDir with a run.json and no finished review, oldest first. */
export function unreviewedRuns(runsDir) {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((name) => existsSync(join(runsDir, name, "run.json")))
    .filter((name) => {
      const review = join(runsDir, name, "review.json");
      return !existsSync(review) || JSON.parse(readFileSync(review, "utf8")).done !== true;
    })
    .sort();
}

/**
 * The reason a deploy to this environment must stop, or null. Only the environments in `held` are held back
 * (the project's board.config.json "gate.holdUntilReviewed").
 * @param {string} environment
 * @param {string} runsDir
 * @param {{ held?: string[], boardUrl?: string }} [options]
 * @returns {string | null}
 */
export function reviewGateProblem(
  environment,
  runsDir,
  { held = [], boardUrl = "http://localhost:8095/review" } = {},
) {
  if (!held.includes(environment)) return null;
  const open = unreviewedRuns(runsDir);
  if (open.length === 0) return null;
  return (
    `No ${environment} deploy while a run waits for its review: ${open.join(", ")}.\n` +
    `  Review it on the board (${boardUrl}) and press "Review done".`
  );
}
