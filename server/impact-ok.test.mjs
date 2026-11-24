import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setImpactOk } from "./impact-ok.mjs";

const config = { taskFiles: [{ file: "small-fix.md" }, { file: "bug.json" }] };
const FILE = "night-run/small-fix.json";
const day = new Date("2030-03-04T10:00:00Z");

function project() {
  const dir = mkdtempSync(join(tmpdir(), "impact-ok-"));
  mkdirSync(join(dir, "night-run"));
  const data = {
    title: "Small fixes",
    tasks: [{ id: "T.1", title: "x", impact: { cost: { effect: "worse", note: "n" }, cpu: { effect: "none" } } }],
  };
  writeFileSync(join(dir, FILE), JSON.stringify(data));
  writeFileSync(join(dir, "secret.json"), "{}");
  return dir;
}
const saved = (dir) => JSON.parse(readFileSync(join(dir, FILE), "utf8")).tasks[0].impact;

test("approve sets today's date, un-approve removes it, file ends with a newline", () => {
  const dir = project();
  const impact = setImpactOk(dir, config, { file: FILE, id: "T.1", key: "cost", ok: true }, day);
  assert.equal(impact.cost.approved, "2030-03-04");
  assert.equal(saved(dir).cost.approved, "2030-03-04");
  assert.ok(readFileSync(join(dir, FILE), "utf8").endsWith("}\n"));
  setImpactOk(dir, config, { file: FILE, id: "T.1", key: "cost", ok: false });
  assert.equal("approved" in saved(dir).cost, false);
});

test("refuses a non-worse item", () => {
  assert.throws(() => setImpactOk(project(), config, { file: FILE, id: "T.1", key: "cpu", ok: true }), /only a worse/);
});

test("refuses unknown file, task and key", () => {
  const dir = project();
  assert.throws(() => setImpactOk(dir, config, { file: "night-run/bug.json", id: "T.1", key: "cost", ok: true }), /not found/);
  assert.throws(() => setImpactOk(dir, config, { file: FILE, id: "nope", key: "cost", ok: true }), /task not found/);
  assert.throws(() => setImpactOk(dir, config, { file: FILE, id: "T.1", key: "memory", ok: true }), /item not found/);
  assert.throws(() => setImpactOk(dir, config, { file: FILE, id: "T.1", key: "__proto__", ok: true }), /item not found/);
});

test("refuses path traversal and files that are not configured task files", () => {
  const dir = project();
  for (const file of ["../secret.json", "night-run/../secret.json", "secret.json", "night-run/other.json", "/etc/passwd", undefined]) {
    assert.throws(() => setImpactOk(dir, config, { file, id: "T.1", key: "cost", ok: true }), /not a task file/);
  }
});
