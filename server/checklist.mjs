// The plan checklist: the default items in defaults/plan-checklist.json, the project's ticks and added items in
// <paths.board>/plan-checklist.json: { items: { <id>: { approve, claude } }, added: [ { id, name, description, approve, claude } ] }.
// Only ticks that differ from the default are stored. Added items have ids own-1, own-2, … and the group "Your own items".
//   nightshift checklist          the three lists the plan skill reads: { approve, claude, both }
//   nightshift checklist-import   reads a "Plan checklist choices" text from stdin and sets all ticks (bin/nightshift.mjs)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CHECKLIST = join(HERE, "..", "defaults", "plan-checklist.json");
export const OWN_GROUP = "Your own items";
export const NAME_LIMITS = { min: 2, max: 80 };
export const DESCRIPTION_LIMITS = { min: 0, max: 300 };

// A limit or character problem: the board answers 400 with the reason.
export class ChecklistError extends Error {
  status = 400;
}

const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;

export const projectChecklistPath = (config, projectDir) =>
  join(projectDir, config.paths.board, "plan-checklist.json");

function readOwn(config, projectDir) {
  const own = readJson(projectChecklistPath(config, projectDir), {});
  return { items: own.items ?? {}, added: own.added ?? [] };
}

function writeOwn(config, projectDir, own) {
  const file = projectChecklistPath(config, projectDir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(own, null, 2) + "\n");
}

const defaults = () => readJson(DEFAULT_CHECKLIST).items;

// Plain text: trimmed, NFC, no < or >, no hidden characters (control, zero-width and direction-changing ones).
const HIDDEN_CODES = [0x200b, 0x2060, 0xfeff];
const isHidden = (char) => {
  const code = char.codePointAt(0);
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    HIDDEN_CODES.includes(code)
  );
};

function plainLine(value, label, { min, max }) {
  if (typeof value !== "string") throw new ChecklistError(`${label} must be text`);
  const text = value.normalize("NFC").trim().replace(/ {2,}/g, " ");
  if (/[\r\n]/.test(text)) throw new ChecklistError(`${label} must be one line`);
  if (/[<>]/.test(text)) throw new ChecklistError(`${label} must not contain < or >`);
  if ([...text].some(isHidden)) throw new ChecklistError(`${label} must not contain hidden characters`);
  const length = [...text].length;
  if (length < min) throw new ChecklistError(`${label} must be at least ${min} characters`);
  if (length > max) throw new ChecklistError(`${label} must be at most ${max} characters`);
  return text;
}

/** All items: the defaults with the project's ticks laid over them, then the added items. */
export function readChecklist(config, projectDir) {
  const own = readOwn(config, projectDir);
  const items = defaults().map((item) => ({ ...item, ...own.items[item.id] }));
  const added = own.added.map((item) => ({
    ...item,
    group: OWN_GROUP,
    important: false,
    added: true,
  }));
  return [...items, ...added];
}

/** Sets one item's ticks; a tick equal to the default is not stored. Returns the merged list. */
export function setTick(config, projectDir, id, { approve, claude }) {
  const own = readOwn(config, projectDir);
  const added = own.added.find((item) => item.id === id);
  if (added) {
    added.approve = Boolean(approve);
    added.claude = Boolean(claude);
  } else {
    const base = defaults().find((item) => item.id === id);
    if (!base) throw new ChecklistError(`No checklist item "${id}"`);
    if (Boolean(approve) === base.approve && Boolean(claude) === base.claude) delete own.items[id];
    else own.items[id] = { approve: Boolean(approve), claude: Boolean(claude) };
  }
  writeOwn(config, projectDir, own);
  return readChecklist(config, projectDir);
}

/** Adds an item of the project's own (name 2 to 80, description 0 to 300, one line each). */
export function addItem(config, projectDir, { name, description = "" }) {
  const clean = {
    name: plainLine(name, "Name", NAME_LIMITS),
    description: plainLine(description, "Description", DESCRIPTION_LIMITS),
  };
  const own = readOwn(config, projectDir);
  const numbers = own.added.map((item) => Number(item.id.replace("own-", "")));
  const id = `own-${Math.max(0, ...numbers) + 1}`;
  own.added.push({ id, ...clean, approve: false, claude: false });
  writeOwn(config, projectDir, own);
  return readChecklist(config, projectDir);
}

/** Removes an added item; the default items cannot be removed. */
export function removeItem(config, projectDir, id) {
  const own = readOwn(config, projectDir);
  if (!own.added.some((item) => item.id === id))
    throw new ChecklistError(`"${id}" is not an added item`);
  own.added = own.added.filter((item) => item.id !== id);
  writeOwn(config, projectDir, own);
  return readChecklist(config, projectDir);
}

/** The three lists the plan skill reads: items for the owner to approve, for Claude to do, and both. */
export function printLists(config, projectDir) {
  const lists = { approve: [], claude: [], both: [] };
  for (const { name, description, approve, claude } of readChecklist(config, projectDir)) {
    if (approve && claude) lists.both.push({ name, description });
    else if (approve) lists.approve.push({ name, description });
    else if (claude) lists.claude.push({ name, description });
  }
  return lists;
}

/**
 * Sets every item's ticks from a "Plan checklist choices" text, by name: lines "<anyone> approves: a; b",
 * "Claude does: c" and "Both: d". Returns { changed, skipped }.
 */
export function importChoices(config, projectDir, text) {
  const lists = { approve: new Set(), claude: new Set(), both: new Set() };
  const skipped = [];
  const keyOf = (label) => {
    const key = label.toLowerCase();
    if (key === "claude does") return "claude";
    if (key === "both") return "both";
    return key.endsWith(" approves") ? "approve" : null;
  };
  const items = readChecklist(config, projectDir);
  const byName = new Map(items.map((item) => [item.name.toLowerCase(), item]));
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    const key = match && keyOf(match[1]);
    if (!key) continue;
    for (const name of match[2].split(";").map((s) => s.trim()).filter(Boolean)) {
      const item = byName.get(name.toLowerCase());
      if (item) lists[key].add(item.id);
      else skipped.push(name);
    }
  }
  let changed = 0;
  for (const item of items) {
    const approve = lists.approve.has(item.id) || lists.both.has(item.id);
    const claude = lists.claude.has(item.id) || lists.both.has(item.id);
    if (approve === item.approve && claude === item.claude) continue;
    setTick(config, projectDir, item.id, { approve, claude });
    changed += 1;
  }
  return { changed, skipped };
}
