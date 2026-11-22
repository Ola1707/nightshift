import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import {
  addItem,
  importChoices,
  printLists,
  projectChecklistPath,
  readChecklist,
  removeItem,
  setTick,
} from "./checklist.mjs";

function project(own) {
  const dir = mkdtempSync(join(tmpdir(), "checklist-"));
  const config = loadConfig(dir);
  if (own) {
    mkdirSync(join(dir, config.paths.board), { recursive: true });
    writeFileSync(projectChecklistPath(config, dir), JSON.stringify(own));
  }
  return { dir, config };
}

const ownFile = ({ dir, config }) => JSON.parse(readFileSync(projectChecklistPath(config, dir), "utf8"));
const byId = (items, id) => items.find((item) => item.id === id);

test("no project file: the 49 default items in page order with the default ticks", () => {
  const { dir, config } = project();
  const items = readChecklist(config, dir);
  assert.equal(items.length, 49);
  assert.equal(items.filter((i) => i.important).length, 22);
  assert.equal(items.reduce((n, i) => n + Number(i.approve) + Number(i.claude), 0), 22);
  assert.equal(items[0].id, "i98");
  assert.deepEqual(
    [byId(items, "i98").approve, byId(items, "i98").claude],
    [false, true],
  );
  assert.ok(items.every((i) => i.important === (i.group === null)));
});

test("project ticks are laid over the defaults, added items come last", () => {
  const { dir, config } = project({
    items: { i98: { approve: true, claude: false } },
    added: [{ id: "own-1", name: "Mine", description: "", approve: true, claude: false }],
  });
  const items = readChecklist(config, dir);
  assert.equal(items.length, 50);
  assert.deepEqual([byId(items, "i98").approve, byId(items, "i98").claude], [true, false]);
  const own = items.at(-1);
  assert.equal(own.id, "own-1");
  assert.equal(own.group, "Your own items");
  assert.equal(own.important, false);
});

test("a tick equal to the default is not stored", () => {
  const p = project();
  setTick(p.config, p.dir, "i98", { approve: true, claude: true });
  assert.deepEqual(ownFile(p).items, { i98: { approve: true, claude: true } });
  setTick(p.config, p.dir, "i98", { approve: false, claude: true });
  assert.deepEqual(ownFile(p).items, {});
  assert.throws(() => setTick(p.config, p.dir, "nope", { approve: true, claude: true }), /No checklist item/);
});

test("add and remove: ids count up, only added items can be removed", () => {
  const p = project();
  addItem(p.config, p.dir, { name: "  First   item ", description: "About it" });
  const items = addItem(p.config, p.dir, { name: "Second" });
  assert.deepEqual(items.slice(-2).map((i) => i.id), ["own-1", "own-2"]);
  assert.equal(items.at(-2).name, "First item");
  setTick(p.config, p.dir, "own-2", { approve: true, claude: false });
  assert.equal(ownFile(p).added[1].approve, true);
  removeItem(p.config, p.dir, "own-1");
  assert.deepEqual(ownFile(p).added.map((i) => i.id), ["own-2"]);
  assert.equal(addItem(p.config, p.dir, { name: "Third" }).at(-1).id, "own-3");
  assert.throws(() => removeItem(p.config, p.dir, "i98"), /not an added item/);
});

test("length and character limits throw with the reason", () => {
  const p = project();
  const add = (name, description) => () => addItem(p.config, p.dir, { name, description });
  assert.throws(add("a", ""), /Name must be at least 2/);
  assert.throws(add(" a ", ""), /Name must be at least 2/);
  assert.throws(add("x".repeat(81), ""), /Name must be at most 80/);
  assert.doesNotThrow(add("x".repeat(80), "y".repeat(300)));
  assert.throws(add("ok", "y".repeat(301)), /Description must be at most 300/);
  assert.throws(add("a<b", ""), /< or >/);
  assert.throws(add("ok", "x>y"), /< or >/);
  assert.throws(add("two\nlines", ""), /one line/);
  assert.throws(add("zero​width", ""), /hidden characters/);
  assert.throws(add("bidi‮flip", ""), /hidden characters/);
  assert.throws(add("tab\there", ""), /hidden characters/);
  assert.throws(add(5, ""), /must be text/);
  // Characters are counted as people see them: two emoji are two characters.
  assert.doesNotThrow(add("\u{1F600}\u{1F600}", ""));
});

const SAMPLE = [
  "Plan checklist choices",
  "Owner approves: Edge cases; Security",
  "Claude does: Logs; Rollback; No such item",
  "Both: Cost",
].join("\n");

test("import sets every item's ticks by name and reports unknown names", () => {
  const p = project();
  const before = readChecklist(p.config, p.dir);
  const { changed, skipped } = importChoices(p.config, p.dir, SAMPLE);
  assert.deepEqual(skipped, ["No such item"]);
  const items = readChecklist(p.config, p.dir);
  const tick = (name) => {
    const item = items.find((i) => i.name === name);
    return [item.approve, item.claude];
  };
  assert.deepEqual(tick("Edge cases"), [true, false]);
  assert.deepEqual(tick("Logs"), [false, true]);
  assert.deepEqual(tick("Cost"), [true, true]);
  assert.deepEqual(tick("Time"), [false, false]);
  const differing = items.filter((item, i) => item.approve !== before[i].approve || item.claude !== before[i].claude);
  assert.equal(changed, differing.length);
  // Importing the same text again changes nothing.
  assert.equal(importChoices(p.config, p.dir, SAMPLE).changed, 0);
});

test("print lists approve, claude and both with name and description", () => {
  const p = project({ items: {}, added: [] });
  importChoices(p.config, p.dir, SAMPLE);
  const lists = printLists(p.config, p.dir);
  assert.deepEqual(lists.approve.map((i) => i.name).sort(), ["Edge cases", "Security"].sort());
  assert.deepEqual(lists.both.map((i) => i.name), ["Cost"]);
  assert.deepEqual(lists.claude.map((i) => i.name).sort(), ["Logs", "Rollback"]);
  assert.ok(lists.both[0].description.length > 0);
});
