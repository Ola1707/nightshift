// The pictures a run.json points to: each task's before and after shots and each failed test's screenshot.
// Videos and full URLs are not pictures in the repo, so they are left out.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { isBlankPicture } from "./shot-check.mjs";

const PICTURE = /\.(png|jpe?g|gif|webp)$/i;

/**
 * Every repo-relative picture path in a run.json, with where it is used.
 * @param {object} run the parsed run.json
 * @returns {{ where: string, path: string }[]}
 */
export function runPictures(run) {
  const found = [];
  for (const task of run?.tasks ?? []) {
    for (const when of ["before", "after"]) {
      for (const shot of task[when] ?? [])
        found.push({ where: `task ${task.id ?? task.title} ${when}`, path: shot.path });
    }
  }
  for (const f of run?.failures ?? [])
    if (f.screenshot) found.push({ where: `failure ${f.test}`, path: f.screenshot });
  return found.filter(
    (p) => typeof p.path === "string" && !/^https?:/.test(p.path) && PICTURE.test(p.path),
  );
}

// Blank or not, per file and modification time, so a page reload doesn't decode every picture again.
const blankCache = new Map();

/**
 * The run's pictures that can't be shown: "missing" (no file) or "blank" (almost one color, see shot-check.mjs; a
 * file that can't be decoded counts as blank).
 * @param {object} run the parsed run.json
 * @param {string} repo the repo's root folder
 * @returns {Promise<Record<string, "missing" | "blank">>} path → problem; pictures without a problem are left out
 */
export async function pictureProblems(run, repo) {
  const problems = {};
  for (const { path } of runPictures(run)) {
    const file = join(repo, path);
    if (!existsSync(file)) {
      problems[path] = "missing";
      continue;
    }
    const key = `${file}:${statSync(file).mtimeMs}`;
    if (!blankCache.has(key)) blankCache.set(key, await isBlankPicture(file).catch(() => true));
    if (blankCache.get(key)) problems[path] = "blank";
  }
  return problems;
}

/**
 * The run's test report pages (testRuns[].report and failures[].report, without the #anchor) that are gone: the runs
 * folder is gitignored and may be cleaned. The review page then says "page no longer on this computer".
 * @param {object} run the parsed run.json
 * @param {string} repo the repo's root folder
 * @returns {Record<string, "missing">} report file → "missing"; pages that exist are left out
 */
export function reportProblems(run, repo) {
  const problems = {};
  const reports = [...(run?.testRuns ?? []), ...(run?.failures ?? [])].map((r) => r.report);
  for (const report of reports) {
    if (typeof report !== "string" || /^https?:/.test(report)) continue;
    const file = report.split("#")[0];
    if (!existsSync(join(repo, file))) problems[file] = "missing";
  }
  return problems;
}
