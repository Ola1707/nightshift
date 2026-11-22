// Types for lib/index.mjs, so TypeScript callers can import the package.

export interface TaskFile {
  file: string;
  title: string;
  planOnly?: boolean;
}

export interface Suite {
  id: string;
  run: string;
  [key: string]: unknown;
}

/** The board's settings: board.config.json laid over the defaults. */
export interface BoardConfig {
  schemaVersion: number;
  owner: string;
  port: number;
  paths: { roadmaps: string; tasks: string; runs: string; board: string; served: string[] };
  nextRunFile: string;
  taskFiles: TaskFile[];
  roadmaps: { pattern: string; exclude: string[]; order: string[]; titlePrefix: string };
  suites: Suite[];
  apps: string[];
  skills: Record<string, string>;
  gate: { holdUntilReviewed: string[] };
  reviewMode: { alsoGuard: string[] };
}

/** The settings of the project in projectDir; throws naming the key when a value has the wrong type. */
export function loadConfig(projectDir: string): BoardConfig;

/** The run folders under runsDir with a run.json and no finished review, oldest first. */
export function unreviewedRuns(runsDir: string): string[];

/** The reason a deploy to this environment must stop, or null. Only the environments in `held` are held back. */
export function reviewGateProblem(
  environment: string,
  runsDir: string,
  options?: { held?: string[]; boardUrl?: string },
): string | null;

/** True when 98% or more of the picture's pixels are within 8 of its most common color on each channel. */
export function isBlankPicture(path: string): Promise<boolean>;

/** Every repo-relative picture path in a parsed run.json, with where it is used. */
export function runPictures(run: unknown): { where: string; path: string }[];

/** The run's pictures that can't be shown: path → "missing" (no file) or "blank"; good pictures are left out. */
export function pictureProblems(run: unknown, repo: string): Promise<Record<string, "missing" | "blank">>;
