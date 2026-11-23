#!/usr/bin/env node
// Nightshift's command line. The project is the folder it is run in (or BOARD_PROJECT).
//   nightshift serve              the board (http://localhost:8095, or BOARD_PORT / "port" in board.config.json)
//   nightshift flow [id]          the merged flow of work (or one type) as JSON
//   nightshift checklist          the plan checklist's three lists: { approve, claude, both }
//   nightshift checklist-import   sets every checklist tick from a "Plan checklist choices" text on stdin
//   nightshift config             the merged settings (board.config.json laid over the defaults)
//   nightshift init               writes board.config.json and the folders and files the board needs
//   nightshift doctor             checks the project, one OK or PROBLEM line per check
//   nightshift rules              which project rules files to read, and which need checking after a plugin change
//   nightshift demo               the board on an invented project (http://localhost:8096)
// While developing: NIGHTSHIFT_DEV_DIR=<folder with bin/nightshift.mjs> runs that copy instead of this one.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = realpathSync(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const devDir = process.env.NIGHTSHIFT_DEV_DIR;
if (devDir) {
  const other = join(resolve(devDir), "bin", "nightshift.mjs");
  if (existsSync(other) && realpathSync(other) !== SELF) {
    const { status, signal } = spawnSync(process.execPath, [other, ...args], { stdio: "inherit" });
    process.exit(signal ? 1 : (status ?? 1));
  }
}

const USAGE = `Usage: nightshift <command>
  serve              start the board for the project in this folder
  flow [id]          print the merged flow of work, or one type
  checklist          print the plan checklist's lists (approve, claude, both)
  checklist-import   set the checklist ticks from a "Plan checklist choices" text on stdin
  config             print the merged settings
  init [--answers <file>] [--force]
                     write board.config.json (from a JSON answers file) and what the board needs; never overwrites
  doctor [--shots]   check the project: one OK or PROBLEM line per check; --shots also checks the suites' screenshots
  rules --plugin <dir> [skill...] [--mark]
                     the project's rules files for those skills (default all) and all.md: OK, NONE, or CHANGED
                     (the plugin skill changed since the file was checked; exit 1); --mark records them as checked
  demo               serve the board on an invented project, http://localhost:8096`;

const projectDir = () => resolve(process.env.BOARD_PROJECT ?? process.cwd());
const print = (value) => console.log(JSON.stringify(value, null, 2));

async function main() {
  const [command, ...rest] = args;
  const here = dirname(SELF);
  const server = (file) => import(join(here, "..", "server", file));

  switch (command) {
    case "serve": {
      process.env.BOARD_PROJECT = projectDir();
      await server("server.mjs");
      return;
    }
    case "config": {
      const { loadConfig } = await server("config.mjs");
      print(loadConfig(projectDir()));
      return;
    }
    case "flow": {
      const { loadConfig } = await server("config.mjs");
      const { readFlow } = await server("flow.mjs");
      const dir = projectDir();
      const flow = readFlow(loadConfig(dir), dir);
      const [id] = rest;
      const out = id ? flow.types.find((t) => t.id === id) : flow;
      if (!out) {
        console.error(`No type "${id}". Types: ${flow.types.map((t) => t.id).join(", ")}`);
        process.exit(1);
      }
      print(out);
      return;
    }
    case "checklist": {
      const { loadConfig } = await server("config.mjs");
      const { printLists } = await server("checklist.mjs");
      const dir = projectDir();
      print(printLists(loadConfig(dir), dir));
      return;
    }
    case "checklist-import": {
      const { loadConfig } = await server("config.mjs");
      const { importChoices } = await server("checklist.mjs");
      const text = readFileSync(0, "utf8");
      if (!/^\s*Plan checklist choices/.test(text)) {
        console.error('The text must start with "Plan checklist choices".');
        process.exit(1);
      }
      const dir = projectDir();
      const { changed, skipped } = importChoices(loadConfig(dir), dir, text);
      console.log(`Changed ${changed} item${changed === 1 ? "" : "s"}.`);
      for (const name of skipped) console.log(`Skipped, unknown name: ${name}`);
      return;
    }
    case "init": {
      const { initProject, SetupError } = await server("setup.mjs");
      const at = rest.indexOf("--answers");
      try {
        let answers = {};
        if (at !== -1) {
          if (!rest[at + 1]) throw new SetupError("--answers needs a file.");
          const file = resolve(rest[at + 1]);
          if (!existsSync(file)) throw new SetupError(`Answers file not found: ${file}`);
          try {
            answers = JSON.parse(readFileSync(file, "utf8"));
          } catch (error) {
            throw new SetupError(`The answers file is not valid JSON: ${error.message}`);
          }
        }
        for (const line of initProject(projectDir(), { answers, force: rest.includes("--force") })) console.log(line);
      } catch (error) {
        if (!(error instanceof SetupError)) throw error;
        console.error(error.message);
        process.exit(1);
      }
      return;
    }
    case "doctor": {
      const { doctor } = await server("setup.mjs");
      const results = await doctor(projectDir(), { shots: rest.includes("--shots") });
      for (const { text } of results) console.log(text);
      process.exit(results.some((r) => !r.ok) ? 1 : 0);
      return;
    }
    case "rules": {
      const { loadConfig } = await server("config.mjs");
      const { rulesStatus, markChecked, formatStatus } = await server("rules.mjs");
      const at = rest.indexOf("--plugin");
      const pluginDir = at === -1 ? undefined : rest[at + 1];
      if (!pluginDir) {
        console.error("rules needs --plugin <the plugin folder, with skills/ inside>.");
        process.exit(2);
      }
      const names = rest.filter((arg, i) => !arg.startsWith("--") && i !== at + 1);
      const dir = projectDir();
      const board = loadConfig(dir).paths.board;
      try {
        if (rest.includes("--mark")) {
          for (const entry of rulesStatus(dir, board, resolve(pluginDir), names))
            if (entry.state !== "none") markChecked(dir, board, resolve(pluginDir), entry.name);
        }
        const entries = rulesStatus(dir, board, resolve(pluginDir), names);
        for (const line of formatStatus(entries)) console.log(line);
        process.exit(entries.some((e) => e.state === "changed" || e.state === "unchecked") ? 1 : 0);
      } catch (error) {
        console.error(error.message);
        process.exit(2);
      }
      return;
    }
    case "demo": {
      const { prepareDemo, DEMO_PORT } = await server("setup.mjs");
      const copy = prepareDemo();
      process.env.BOARD_PROJECT = copy;
      process.env.BOARD_PORT = String(DEMO_PORT);
      console.log(`Demo project (a copy; your changes stay in ${copy}):`);
      await server("server.mjs");
      return;
    }
    default:
      console.error(USAGE);
      process.exit(2);
  }
}

await main();
