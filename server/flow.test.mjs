import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import { approveType, projectFlowPath, readFlow } from "./flow.mjs";

const DEFAULT_IDS = [
  "small-fix",
  "bug",
  "visual-change",
  "feature",
  "big-feature",
  "infrastructure",
  "night-run",
  "review",
];

function project(own) {
  const dir = mkdtempSync(join(tmpdir(), "flow-"));
  const config = loadConfig(dir);
  if (own) {
    mkdirSync(join(dir, config.paths.board), { recursive: true });
    writeFileSync(projectFlowPath(config, dir), JSON.stringify(own));
  }
  return { dir, config };
}

const ownFile = ({ dir, config }) => JSON.parse(readFileSync(projectFlowPath(config, dir), "utf8"));
const writeOwn = ({ dir, config }, own) => writeFileSync(projectFlowPath(config, dir), JSON.stringify(own));

test("no project file: the default types, in order, none approved", () => {
  const { dir, config } = project();
  const flow = readFlow(config, dir);
  assert.deepEqual(flow.types.map((t) => t.id), DEFAULT_IDS);
  assert.ok(flow.types.every((t) => !t.approved && !t.changed));
  assert.equal(flow.roles.planner, "Opus");
  for (const t of flow.types) assert.ok(Array.isArray(t.steps) !== Array.isArray(t.parts), t.id);
});

test("a project type replaces the default one in its place", () => {
  const p = project({ types: { bug: { title: "Defect", steps: [{ who: "human", text: "sees it" }] } } });
  const flow = readFlow(p.config, p.dir);
  assert.deepEqual(flow.types.map((t) => t.id), DEFAULT_IDS);
  const bug = flow.types[1];
  assert.equal(bug.title, "Defect");
  assert.deepEqual(bug.steps, [{ who: "human", text: "sees it" }]);
});

test("a new id is added at the end; null hides a default type", () => {
  const p = project({
    types: { docs: { title: "Docs", steps: [{ who: "coder", text: "write" }] }, infrastructure: null },
  });
  const ids = readFlow(p.config, p.dir).types.map((t) => t.id);
  assert.deepEqual(ids, [...DEFAULT_IDS.filter((id) => id !== "infrastructure"), "docs"]);
});

test("always, intro and roles from the project file", () => {
  const p = project({ always: [{ title: "One", text: "rule" }], intro: "Hi", roles: { deploy: "Staging" } });
  const flow = readFlow(p.config, p.dir);
  assert.deepEqual(flow.always, [{ title: "One", text: "rule" }]);
  assert.equal(flow.intro, "Hi");
  assert.equal(flow.roles.deploy, "Staging");
  assert.equal(flow.roles.human, "Human");
});

test("a type with both steps and parts is refused", () => {
  const p = project({ types: { bug: { title: "Bug", steps: [], parts: [] } } });
  assert.throws(() => readFlow(p.config, p.dir), /"bug" must have steps or parts, not both/);
});

test("approve: saved in the project file, read again after a restart, undone", () => {
  const p = project({ types: {}, approved: {} });
  approveType(p.config, p.dir, "bug", true);
  const saved = ownFile(p).approved.bug;
  assert.match(saved.hash, /^[0-9a-f]{40}$/);
  assert.ok(!Number.isNaN(Date.parse(saved.at)));
  const bug = readFlow(p.config, p.dir).types.find((t) => t.id === "bug");
  assert.equal(bug.approved, true);
  assert.equal(bug.changed, false);
  assert.equal(bug.approvedAt, saved.at);
  assert.equal(readFlow(p.config, p.dir).types.find((t) => t.id === "feature").approved, false);

  approveType(p.config, p.dir, "bug", false);
  assert.deepEqual(ownFile(p).approved, {});
  assert.equal(readFlow(p.config, p.dir).types.find((t) => t.id === "bug").approved, false);
});

test("approve with no project file creates it; an unknown id is refused", () => {
  const p = project();
  approveType(p.config, p.dir, "review", true);
  assert.ok(ownFile(p).approved.review);
  assert.throws(() => approveType(p.config, p.dir, "nope", true), /no type "nope"/);
});

test("a changed step clears the approval", () => {
  const p = project({ types: {}, approved: {} });
  approveType(p.config, p.dir, "feature", true);
  const own = ownFile(p);
  const feature = JSON.parse(JSON.stringify(readFlow(p.config, p.dir).types.find((t) => t.id === "feature")));
  for (const key of ["id", "approved", "approvedAt", "changed"]) delete feature[key];
  writeOwn(p, { ...own, types: { feature } });
  assert.equal(readFlow(p.config, p.dir).types.find((t) => t.id === "feature").approved, true);

  feature.parts[1].steps[0].text = "plan, with a sketch";
  writeOwn(p, { ...own, types: { feature } });
  const after = readFlow(p.config, p.dir).types.find((t) => t.id === "feature");
  assert.equal(after.approved, false);
  assert.equal(after.changed, true);
  assert.equal(after.approvedAt, null);
});

test("impact: the list lives once in the default flow; a step with impact: true shows it as its note", () => {
  const p = project({ types: { bug: { title: "Bug", steps: [{ who: "planner", text: "shows Human the impact", impact: true }] } } });
  const flow = readFlow(p.config, p.dir);
  assert.match(flow.impact, /^CPU · memory/);
  const step = flow.types[1].steps[0];
  assert.equal(step.note, flow.impact);
  assert.equal("impact" in step, false);
  const parts = flow.types.find((t) => t.id === "feature").parts;
  assert.ok(parts.some((part) => part.steps.some((s) => s.note === flow.impact)));
  const own = project({ impact: "CPU · cost" });
  assert.equal(readFlow(own.config, own.dir).impact, "CPU · cost");
});
