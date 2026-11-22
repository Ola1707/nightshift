import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULTS, loadConfig } from "./config.mjs";

const project = (config) => {
  const dir = mkdtempSync(join(tmpdir(), "board-config-"));
  if (config !== undefined) writeFileSync(join(dir, "board.config.json"), JSON.stringify(config));
  return dir;
};

test("defaults when there is no file", () => {
  assert.deepEqual(loadConfig(project()), DEFAULTS);
});

test("a file overrides one key and keeps the rest", () => {
  const config = loadConfig(project({ owner: "Sam", paths: { served: ["docs", "out"] } }));
  assert.equal(config.owner, "Sam");
  assert.deepEqual(config.paths.served, ["docs", "out"]);
  assert.equal(config.paths.runs, "docs/release-log");
  assert.equal(config.port, 8095);
});

test("a bad type names the key", () => {
  assert.throws(
    () => loadConfig(project({ paths: { served: "docs" } })),
    /board\.config\.json: "paths\.served" must be a list of strings/,
  );
  assert.throws(() => loadConfig(project({ suites: [{ id: "web" }] })), /"suites\[0\]\.run"/);
});
