// The flow of work: the default in defaults/flow.json, laid over by the project's <paths.board>/flow.json.
// The project file: { impact?, intro?, roles?, types: { <id>: <whole type> | null }, always?, eachDay?, approved: { <id>: { at, hash } } }.
// A project type replaces the default with the same id, a new id is added at the end, null hides a default type;
// impact, intro, always and eachDay replace the default, roles merge key by key.
// An approval holds the sha1 of the merged type's JSON: when the type changes, it no longer counts.
//   nightshift flow [id]   prints the merged flow (or one type) of the project (bin/nightshift.mjs).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FLOW = join(HERE, "..", "defaults", "flow.json");

const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;

export const projectFlowPath = (config, projectDir) =>
  join(projectDir, config.paths.board, "flow.json");

export const typeHash = (type) => createHash("sha1").update(JSON.stringify(type)).digest("hex");

// The impact list lives once (`impact`); a step with `impact: true` gets it as its note.
const withImpact = (steps, impact) =>
  steps.map(({ impact: on, ...step }) => (on ? { ...step, note: impact } : step));
function fillImpact(type, impact) {
  if (type.steps) return { ...type, steps: withImpact(type.steps, impact) };
  return { ...type, parts: type.parts.map((part) => ({ ...part, steps: withImpact(part.steps ?? [], impact) })) };
}

function checkType(type) {
  if (Array.isArray(type.steps) === Array.isArray(type.parts))
    throw new Error(`flow.json: type "${type.id}" must have steps or parts, not both`);
}

// The merged flow without approval state.
function mergedFlow(config, projectDir) {
  const base = readJson(DEFAULT_FLOW);
  const own = readJson(projectFlowPath(config, projectDir), {});
  const overrides = own.types ?? {};
  const baseIds = new Set(base.types.map((t) => t.id));
  const types = [];
  for (const type of base.types) {
    if (!(type.id in overrides)) types.push(type);
    else if (overrides[type.id] !== null) types.push(Object.assign({ id: type.id }, overrides[type.id], { id: type.id }));
  }
  for (const [id, type] of Object.entries(overrides))
    if (type !== null && !baseIds.has(id)) types.push(Object.assign({ id }, type, { id }));
  types.forEach(checkType);
  const impact = own.impact ?? base.impact;
  return {
    own,
    flow: {
      impact,
      roles: { ...base.roles, ...own.roles },
      intro: own.intro ?? base.intro,
      types: types.map((type) => fillImpact(type, impact)),
      always: own.always ?? base.always,
      eachDay: own.eachDay ?? base.eachDay,
    },
  };
}

/** The merged flow; each type carries approved, approvedAt and changed (approved before, but the type changed since). */
export function readFlow(config, projectDir) {
  const { own, flow } = mergedFlow(config, projectDir);
  const approvals = own.approved ?? {};
  return {
    ...flow,
    types: flow.types.map((type) => {
      const approval = approvals[type.id];
      const same = Boolean(approval) && approval.hash === typeHash(type);
      return { ...type, approved: same, approvedAt: same ? approval.at : null, changed: Boolean(approval) && !same };
    }),
  };
}

/** Saves (approved true) or removes (false) the approval of one type in the project file; returns the merged flow. */
export function approveType(config, projectDir, id, approved) {
  const { own, flow } = mergedFlow(config, projectDir);
  const type = flow.types.find((t) => t.id === id);
  if (!type) throw new Error(`flow.json: no type "${id}"`);
  const approvals = { ...own.approved };
  if (approved) approvals[id] = { at: new Date().toISOString(), hash: typeHash(type) };
  else delete approvals[id];
  const file = projectFlowPath(config, projectDir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...own, approved: approvals }, null, 2) + "\n");
  return readFlow(config, projectDir);
}
