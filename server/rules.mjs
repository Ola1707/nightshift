// The project's own rules for the plugin's skills: `nightshift rules` (bin/nightshift.mjs).
// Each skill has two files: the plugin's skills/<name>/SKILL.md (the tool, never edited by a project) and the
// project's <paths.board>/skills/<name>.md (what the project adds). <paths.board>/skills/all.md adds to every skill.
// A project file records, in its front matter, `checked: <hash>` of the plugin skill it was last checked against;
// a different hash means the plugin changed and the project's rules must be gone through again before use.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ALL = "all";
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

// The plugin's skills, name → hash of its SKILL.md. `pluginDir` is the plugin folder (with skills/ inside).
export function pluginSkills(pluginDir) {
  const skillsDir = join(pluginDir, "skills");
  if (!existsSync(skillsDir)) throw new Error(`No skills folder in ${pluginDir}.`);
  const skills = {};
  for (const name of readdirSync(skillsDir).sort()) {
    const file = join(skillsDir, name, "SKILL.md");
    if (existsSync(file)) skills[name] = hash(readFileSync(file, "utf8"));
  }
  return skills;
}

// all.md is checked against every skill at once.
const expected = (skills, name) =>
  name === ALL ? hash(Object.entries(skills).map(([n, h]) => `${n}:${h}`).join("\n")) : skills[name];

const FRONT = /^---\n([\s\S]*?)\n---\n?/;
const checkedOf = (text) => text.match(FRONT)?.[1].match(/^checked:\s*(\S+)\s*$/m)?.[1] ?? null;

// One entry per rules file that matters for `names` (default: every plugin skill), all.md first.
// state: "ok" (checked against this plugin), "changed" (the plugin changed since), "unchecked" (no `checked:` yet),
// "none" (the project adds nothing to this skill).
export function rulesStatus(projectDir, boardPath, pluginDir, names) {
  const skills = pluginSkills(pluginDir);
  for (const name of names ?? []) if (!(name in skills)) throw new Error(`No plugin skill "${name}".`);
  const list = [ALL, ...(names?.length ? names : Object.keys(skills))];
  return list.map((name) => {
    const file = join(boardPath, "skills", `${name}.md`);
    const path = join(projectDir, file);
    if (!existsSync(path)) return { name, file, state: "none" };
    const checked = checkedOf(readFileSync(path, "utf8"));
    const now = expected(skills, name);
    return { name, file, state: checked === null ? "unchecked" : checked === now ? "ok" : "changed", checked, now };
  });
}

// Records that the project's rules for `name` were gone through against the current plugin skill.
export function markChecked(projectDir, boardPath, pluginDir, name) {
  const skills = pluginSkills(pluginDir);
  if (name !== ALL && !(name in skills)) throw new Error(`No plugin skill "${name}".`);
  const path = join(projectDir, boardPath, "skills", `${name}.md`);
  if (!existsSync(path)) throw new Error(`No rules file ${join(boardPath, "skills", `${name}.md`)}.`);
  const text = readFileSync(path, "utf8");
  const line = `checked: ${expected(skills, name)}`;
  const front = text.match(FRONT);
  let out;
  if (!front) out = `---\n${line}\n---\n\n${text}`;
  else if (/^checked:/m.test(front[1])) out = text.replace(FRONT, (m) => m.replace(/^checked:.*$/m, line));
  else out = text.replace(FRONT, `---\n${front[1]}\n${line}\n---\n`);
  writeFileSync(path, out);
}

export function formatStatus(entries) {
  return entries.map(({ name, file, state }) => {
    if (state === "none") return `NONE ${name}: the project adds nothing (${file} doesn't exist)`;
    if (state === "ok") return `OK ${name}: read ${file}`;
    if (state === "unchecked") return `CHANGED ${name}: ${file} was never checked against the plugin skill`;
    return `CHANGED ${name}: the plugin skill changed since ${file} was checked`;
  });
}
