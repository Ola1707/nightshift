// The setup commands: `nightshift init`, `nightshift doctor` and `nightshift demo` (bin/nightshift.mjs).
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "./config.mjs";
import { readFlow } from "./flow.mjs";
import { runPictures } from "./run-pictures.mjs";
import { isBlankPicture } from "./shot-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEMO_DIR = join(HERE, "..", "examples", "demo");
export const DEMO_PORT = 8096;
export const DEMO_RUN = "night-run-2030-01-05";

// A problem the command reports in plain words (the CLI prints the message and exits 1).
export class SetupError extends Error {}

const isFile = (path) => existsSync(path) && statSync(path).isFile();
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

/**
 * Writes board.config.json from the answers (any settings keys), then creates what is missing; never overwrites it.
 * @param {string} dir the project folder
 * @param {{ answers?: object, force?: boolean }} [options]
 * @returns {string[]} one line per file or folder: "created <path>" or "kept <path>"
 */
export function initProject(dir, { answers = {}, force = false } = {}) {
  const configFile = join(dir, "board.config.json");
  if (existsSync(configFile) && !force)
    throw new SetupError("board.config.json already exists here. Use --force to replace it.");
  if (answers === null || typeof answers !== "object" || Array.isArray(answers))
    throw new SetupError("The answers file must hold a JSON object of settings.");

  // Check the settings before anything is written.
  const check = mkdtempSync(join(tmpdir(), "nightshift-init-"));
  try {
    writeJson(join(check, "board.config.json"), { schemaVersion: 1, ...answers });
    loadConfig(check);
  } catch (error) {
    throw new SetupError(`The answers are not valid settings: ${error.message}`);
  } finally {
    rmSync(check, { recursive: true, force: true });
  }

  const lines = [];
  const say = (what, path) => lines.push(`${what} ${relative(dir, path) || "."}`);
  const folder = (path) => {
    const had = existsSync(path);
    mkdirSync(path, { recursive: true });
    say(had ? "kept" : "created", path);
  };
  const file = (path, content) => {
    if (existsSync(path)) return say("kept", path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2) + "\n");
    say("created", path);
  };

  mkdirSync(dir, { recursive: true });
  writeJson(configFile, { schemaVersion: 1, ...answers });
  say("created", configFile);
  const config = loadConfig(dir);

  folder(join(dir, config.paths.tasks));
  for (const { file: name, title } of config.taskFiles)
    file(join(dir, config.paths.tasks, name), `# ${title}\n\n## Tasks\n`);
  file(join(dir, config.paths.tasks, config.nextRunFile), "# Next run\n");
  folder(join(dir, config.paths.runs));
  file(join(dir, config.paths.board, "flow.json"), { types: {}, approved: {} });
  file(join(dir, config.paths.board, "plan-checklist.json"), { items: {}, added: [] });
  return lines;
}

// Does something listen on the port, and is it a board? "free" | "board" | "other"
async function portState(port) {
  const open = await new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });
  if (!open) return "free";
  return new Promise((resolve) => {
    const req = request({ port, host: "127.0.0.1", path: "/api/config", timeout: 1000 }, (res) => {
      let text = "";
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => {
        try {
          resolve(Array.isArray(JSON.parse(text).taskFiles) ? "board" : "other");
        } catch {
          resolve("other");
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve("other"));
    req.end();
  });
}

// Runs a suite's screenshot command (stdout is the picture, or the command writes {file}); returns the saved file.
function takeShot(command, cwd, target) {
  const withFile = command.includes("{file}");
  const shell = withFile ? command.replaceAll("{file}", `'${target}'`) : command;
  return new Promise((resolve, reject) => {
    execFile("/bin/sh", ["-c", shell], { cwd, encoding: "buffer", timeout: 60_000, maxBuffer: 64 << 20 }, (error, stdout) => {
      if (error) return reject(new Error(`the command failed (${String(error.message).split("\n")[0]})`));
      if (!withFile) {
        if (stdout.length === 0) return reject(new Error("the command printed no picture"));
        writeFileSync(target, stdout);
      }
      if (!isFile(target)) return reject(new Error("the command made no picture"));
      resolve(target);
    });
  });
}

/**
 * Checks the project; one result per check.
 * @param {string} dir the project folder
 * @param {{ shots?: boolean, port?: number }} [options] port: the port to check (default: BOARD_PORT or the settings)
 * @returns {Promise<{ ok: boolean, text: string }[]>} text starts with "OK" or "PROBLEM: "
 */
export async function doctor(dir, { shots = false, port } = {}) {
  const results = [];
  const ok = (text) => results.push({ ok: true, text: `OK ${text}` });
  const problem = (text) => results.push({ ok: false, text: `PROBLEM: ${text}` });

  if (!isFile(join(dir, "board.config.json")))
    problem(`board.config.json is missing in ${dir}. Run "nightshift init".`);
  let config;
  try {
    config = loadConfig(dir);
    if (results.length === 0) ok("settings file loads");
  } catch (error) {
    problem(`the settings file does not load: ${error.message}. Fix board.config.json.`);
  }
  if (!config) return results;

  for (const [name, value] of [...Object.entries(config.paths).filter(([, v]) => typeof v === "string"), ...config.paths.served.map((v) => ["served", v])]) {
    if (existsSync(join(dir, value))) ok(`path ${name}: ${value}`);
    else problem(`path ${name} "${value}" does not exist. Create the folder or fix paths.${name} in board.config.json.`);
  }

  for (const { file } of config.taskFiles) {
    const path = join(config.paths.tasks, file);
    if (isFile(join(dir, path))) ok(`task file ${path}`);
    else problem(`task file ${path} does not exist. Create it or remove "${file}" from taskFiles.`);
  }

  const runsDir = join(dir, config.paths.runs);
  const runNames = existsSync(runsDir)
    ? readdirSync(runsDir).filter((name) => isFile(join(runsDir, name, "run.json"))).sort()
    : [];
  for (const name of runNames) {
    const runFile = join(config.paths.runs, name, "run.json");
    let run;
    try {
      run = JSON.parse(readFileSync(join(dir, runFile), "utf8"));
    } catch (error) {
      problem(`${runFile} is not valid JSON: ${error.message}. Fix or remove it.`);
      continue;
    }
    if (!Array.isArray(run.tasks)) {
      problem(`${runFile} has no "tasks" list. Add it.`);
      continue;
    }
    const gone = runPictures(run).filter(({ path }) => !existsSync(join(dir, path)));
    if (gone.length === 0) ok(`run ${name}: run.json parses, its pictures exist`);
    for (const { where, path } of gone)
      problem(`run ${name}: the picture for ${where} is missing (${path}). Copy it into the run folder or fix its path in run.json.`);
  }
  if (runNames.length === 0) ok(`no runs yet in ${config.paths.runs}`);

  try {
    const { types } = readFlow(config, dir);
    ok(`${types.filter((t) => t.approved).length} of ${types.length} types approved`);
  } catch (error) {
    problem(`the flow does not load: ${error.message}. Fix ${join(config.paths.board, "flow.json")}.`);
  }

  const boardPort = port ?? Number(process.env.BOARD_PORT ?? config.port);
  const state = await portState(boardPort);
  if (state === "free") ok(`port ${boardPort} is free`);
  else if (state === "board") ok(`port ${boardPort} already answers as the board`);
  else problem(`port ${boardPort} is used by something that is not the board. Stop it or set "port" in board.config.json.`);

  if (shots) {
    const out = mkdtempSync(join(tmpdir(), "nightshift-doctor-"));
    for (const suite of config.suites) {
      const shot = suite.screenshot;
      if (!shot) continue;
      if (!shot.command) {
        if (shot.how) ok(`suite ${suite.id}: skipped: taken by the test runner`);
        continue;
      }
      const target = join(out, `${suite.id.replace(/[^\w.-]/g, "_")}.png`);
      try {
        await takeShot(shot.command, dir, target);
        if (await isBlankPicture(target).catch(() => true))
          problem(`suite ${suite.id}: the screenshot is blank (${target}). Wake the device or app and run again.`);
        else ok(`suite ${suite.id}: screenshot is not blank (${target})`);
      } catch (error) {
        problem(`suite ${suite.id}: ${error.message}. Fix screenshot.command (print a PNG, or use {file} for the picture's path).`);
      }
    }
  }
  return results;
}

// Plain shapes on a colored background: one picture per name.
const PICTURES = {
  "before/home.png": { background: "#e8d9c3", shapes: [["rect", 30, 40, 180, 40, "#8a5a2b"], ["circle", 120, 190, 60, "#c98b4a"], ["rect", 30, 300, 180, 90, "#f5efe6"]] },
  "after/home.png": { background: "#e8d9c3", shapes: [["rect", 30, 40, 180, 40, "#8a5a2b"], ["circle", 120, 190, 60, "#c98b4a"], ["rect", 30, 300, 180, 90, "#f5efe6"], ["rect", 50, 330, 140, 12, "#8a5a2b"], ["rect", 50, 355, 100, 12, "#8a5a2b"]] },
  "before/cart.png": { background: "#d6e4ee", shapes: [["rect", 30, 50, 180, 60, "#ffffff"], ["rect", 30, 130, 180, 60, "#ffffff"], ["rect", 30, 330, 180, 50, "#b8402f"]] },
  "after/cart.png": { background: "#d6e4ee", shapes: [["rect", 30, 50, 180, 60, "#ffffff"], ["rect", 30, 130, 180, 60, "#ffffff"], ["rect", 30, 330, 180, 50, "#2f7d4f"]] },
};

/** Writes the four small demo pictures under the demo run folder of dir; returns their repo-relative paths. */
export async function writeDemoPictures(dir) {
  const paths = [];
  for (const [name, { background, shapes }] of Object.entries(PICTURES)) {
    const body = shapes
      .map(([kind, a, b, c, d, e]) =>
        kind === "rect"
          ? `<rect x="${a}" y="${b}" width="${c}" height="${d}" rx="8" fill="${e}"/>`
          : `<circle cx="${a}" cy="${b}" r="${c}" fill="${d}"/>`,
      )
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="420"><rect width="240" height="420" fill="${background}"/>${body}</svg>`;
    const path = join("docs", "release-log", DEMO_RUN, name);
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    await sharp(Buffer.from(svg)).png().toFile(join(dir, path));
    paths.push(path);
  }
  return paths;
}

/** Copies the demo project into a new folder in the OS temp folder, so writes on the board never reach examples/demo/. */
export function prepareDemo(source = DEMO_DIR) {
  if (!isFile(join(source, "board.config.json"))) throw new SetupError(`The demo project is missing: ${source}`);
  const copy = mkdtempSync(join(tmpdir(), "nightshift-demo-"));
  cpSync(source, copy, { recursive: true });
  return copy;
}
