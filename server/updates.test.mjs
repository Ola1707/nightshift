import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import { pendingUpdates, readUpdates, runUpdate } from "./updates.mjs";

function project() {
  const dir = mkdtempSync(join(tmpdir(), "updates-"));
  mkdirSync(join(dir, "docs/roadmap/night-run"), { recursive: true });
  writeFileSync(join(dir, "docs/roadmap/night-run/bug.md"), "# Bugs\n\n## Open\n\n- [ ] **One (B.1).** x\n");
  return dir;
}

test("the list has tasks-json with the project's paths filled in", () => {
  const [u] = readUpdates(loadConfig(project()));
  assert.equal(u.id, "tasks-json");
  assert.equal(u.changes[0], "docs/roadmap/night-run/*.md → *.json");
});

test("config accepts updates and rejects other answers", () => {
  const dir = project();
  writeFileSync(join(dir, "board.config.json"), JSON.stringify({ updates: { a: "bogus" } }));
  assert.throws(() => loadConfig(dir), /updates/);
});

test("skip records the answer and hides the update", () => {
  const dir = project();
  assert.equal(pendingUpdates(loadConfig(dir)).length, 1);
  assert.equal(runUpdate(dir, loadConfig(dir), "tasks-json", { skip: true }).answer, "skipped");
  assert.equal(pendingUpdates(loadConfig(dir)).length, 0);
  assert.equal(existsSync(join(dir, "docs/roadmap/night-run/bug.md")), true);
});

test("applying tasks-json converts the files and records applied", () => {
  const dir = project();
  const { answer, report } = runUpdate(dir, loadConfig(dir), "tasks-json");
  assert.equal(answer, "applied");
  assert.deepEqual(report.converted, ["bug.md"]);
  assert.equal(existsSync(join(dir, "docs/roadmap/night-run/bug.json")), true);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "board.config.json"), "utf8")), { updates: { "tasks-json": "applied" } });
  assert.throws(() => runUpdate(dir, loadConfig(dir), "nope"), /No update/);
});
