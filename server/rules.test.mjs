import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { markChecked, rulesStatus } from "./rules.mjs";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "nightshift.mjs");

function folder(files) {
  const dir = mkdtempSync(join(tmpdir(), "nightshift-rules-"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

const plugin = () => folder({ "skills/do/SKILL.md": "do v1", "skills/doctor/SKILL.md": "doctor v1" });
const states = (entries) => Object.fromEntries(entries.map((e) => [e.name, e.state]));

test("a project file with no checked hash needs checking; a skill with no file adds nothing", () => {
  const project = folder({ "docs/board/skills/do.md": "# Additions\n- one rule\n" });
  assert.deepEqual(states(rulesStatus(project, "docs/board", plugin(), [])), {
    all: "none",
    do: "unchecked",
    doctor: "none",
  });
});

test("marking records the plugin skill; changing the skill makes it changed again", () => {
  const skills = plugin();
  const project = folder({ "docs/board/skills/do.md": "# Additions\n", "docs/board/skills/all.md": "# All\n" });
  markChecked(project, "docs/board", skills, "do");
  markChecked(project, "docs/board", skills, "all");
  assert.match(readFileSync(join(project, "docs/board/skills/do.md"), "utf8"), /^---\nchecked: [0-9a-f]{12}\n---\n\n# Additions/);
  assert.deepEqual(states(rulesStatus(project, "docs/board", skills, ["do"])), { all: "ok", do: "ok" });

  writeFileSync(join(skills, "skills/doctor/SKILL.md"), "doctor v2");
  // do.md is still fine; all.md covers every skill, so it needs checking again.
  assert.deepEqual(states(rulesStatus(project, "docs/board", skills, ["do"])), { all: "changed", do: "ok" });

  markChecked(project, "docs/board", skills, "all");
  const text = readFileSync(join(project, "docs/board/skills/all.md"), "utf8");
  assert.equal(text.match(/checked:/g).length, 1, "marking again replaces the hash");
});

test("marking keeps other front matter", () => {
  const project = folder({ "docs/board/skills/do.md": "---\nowner: Sam\n---\n# Additions\n" });
  markChecked(project, "docs/board", plugin(), "do");
  assert.match(readFileSync(join(project, "docs/board/skills/do.md"), "utf8"), /^---\nowner: Sam\nchecked: [0-9a-f]{12}\n---\n# Additions/);
});

test("an unknown skill name is refused", () => {
  assert.throws(() => rulesStatus(folder({}), "docs/board", plugin(), ["nope"]), /No plugin skill "nope"/);
});

test("nightshift rules exits 1 while a file needs checking and 0 after --mark", () => {
  const skills = plugin();
  const project = folder({ "board.config.json": "{}", "docs/board/skills/do.md": "# Additions\n" });
  const run = (...args) =>
    spawnSync(process.execPath, [BIN, "rules", "--plugin", skills, ...args], {
      cwd: project,
      env: { ...process.env, BOARD_PROJECT: "", NIGHTSHIFT_DEV_DIR: "" },
      encoding: "utf8",
    });
  const before = run("do");
  assert.equal(before.status, 1, before.stderr);
  assert.match(before.stdout, /^NONE all:/m);
  assert.match(before.stdout, /^CHANGED do: docs\/board\/skills\/do\.md was never checked/m);
  const after = run("do", "--mark");
  assert.equal(after.status, 0, after.stderr);
  assert.match(after.stdout, /^OK do: read docs\/board\/skills\/do\.md$/m);
  assert.equal(run().status, 0, "every skill: do is checked, all and doctor have no file");
});
