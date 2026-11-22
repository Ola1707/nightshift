#!/usr/bin/env node
// Nightshift's command line. The project is the folder it is run in (or BOARD_PROJECT).
//   nightshift serve              the board (http://localhost:8095, or BOARD_PORT / "port" in board.config.json)
//   nightshift flow [id]          the merged flow of work (or one type) as JSON
//   nightshift checklist          the plan checklist's three lists: { approve, claude, both }
//   nightshift checklist-import   sets every checklist tick from a "Plan checklist choices" text on stdin
//   nightshift config             the merged settings (board.config.json laid over the defaults)
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
  config             print the merged settings`;

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
    default:
      console.error(USAGE);
      process.exit(2);
  }
}

await main();
