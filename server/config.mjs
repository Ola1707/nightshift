// The board's settings: defaults, laid over by <project>/board.config.json when it exists.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULTS = {
  schemaVersion: 1,
  owner: "you",
  port: 8095,
  paths: {
    roadmaps: "docs/roadmap",
    tasks: "docs/roadmap/night-run",
    runs: "docs/release-log",
    board: "docs/board",
    served: ["docs"],
  },
  nextRunFile: "next-night-run.md",
  taskFiles: [
    { file: "small-fix.md", title: "Small fixes" },
    { file: "bug.md", title: "Bugs" },
    { file: "visual-change.md", title: "Visual changes" },
    { file: "feature.md", title: "Features" },
    { file: "big-feature.md", title: "Big features" },
    { file: "infrastructure.md", title: "Infrastructure (plan only)", planOnly: true },
  ],
  roadmaps: { pattern: "^roadmap(-.+)?\\.md$", exclude: [], order: [], titlePrefix: "" },
  suites: [],
  apps: [],
  skills: {},
  gate: { holdUntilReviewed: [] },
  reviewMode: { alsoGuard: [] },
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStrings = (v) => Array.isArray(v) && v.every((s) => typeof s === "string");

// Objects merge key by key, everything else (arrays included) is replaced.
function merge(base, over, path = "") {
  if (!isObject(base)) return over;
  if (!isObject(over)) throw new Error(`board.config.json: "${path}" must be an object`);
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const here = path ? `${path}.${key}` : key;
    out[key] = key in base && isObject(base[key]) ? merge(base[key], value, here) : value;
  }
  return out;
}

function fail(key, what) {
  throw new Error(`board.config.json: "${key}" must be ${what}`);
}

function check(config) {
  if (typeof config.schemaVersion !== "number") fail("schemaVersion", "a number");
  if (typeof config.owner !== "string") fail("owner", "a string");
  if (typeof config.port !== "number") fail("port", "a number");
  for (const key of ["roadmaps", "tasks", "runs", "board"])
    if (typeof config.paths[key] !== "string") fail(`paths.${key}`, "a string");
  if (!isStrings(config.paths.served)) fail("paths.served", "a list of strings");
  if (typeof config.nextRunFile !== "string") fail("nextRunFile", "a string");
  if (
    !Array.isArray(config.taskFiles) ||
    !config.taskFiles.every(
      (t) => isObject(t) && typeof t.file === "string" && typeof t.title === "string",
    )
  )
    fail("taskFiles", "a list of { file, title }");
  if (typeof config.roadmaps.pattern !== "string") fail("roadmaps.pattern", "a string");
  for (const key of ["exclude", "order"])
    if (!isStrings(config.roadmaps[key])) fail(`roadmaps.${key}`, "a list of strings");
  if (typeof config.roadmaps.titlePrefix !== "string") fail("roadmaps.titlePrefix", "a string");
  if (!Array.isArray(config.suites)) fail("suites", "a list");
  config.suites.forEach((s, i) => {
    if (!isObject(s) || typeof s.id !== "string") fail(`suites[${i}].id`, "a string");
    if (typeof s.run !== "string") fail(`suites[${i}].run`, "a string");
  });
  if (!isStrings(config.apps)) fail("apps", "a list of strings");
  if (!isObject(config.skills)) fail("skills", "an object");
  if (!isStrings(config.gate.holdUntilReviewed)) fail("gate.holdUntilReviewed", "a list of strings");
  if (!isStrings(config.reviewMode.alsoGuard)) fail("reviewMode.alsoGuard", "a list of strings");
}

/** The settings of the project in projectDir: board.config.json laid over the defaults. */
export function loadConfig(projectDir) {
  const file = join(projectDir, "board.config.json");
  const user = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const config = merge(DEFAULTS, user);
  check(config);
  return config;
}
