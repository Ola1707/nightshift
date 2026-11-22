import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "privacy-check.mjs");

function folder(files, { git = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "privacy-"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  if (git) execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

const check = (dir) => spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });

const WORDS = ["Mallory", "re:\\bEve\\b", "re:\\bticket-\\d{4}\\b", ""].join("\n");

test("a banned word fails with file and line, without printing the word", () => {
  const dir = folder({
    ".private-words": WORDS,
    "README.md": "# Corner Bakery\n\nWritten by Mallory.\n",
    "src/a.mjs": "// fine\n// see ticket-1234\n",
    "notes.txt": "Evening is fine, Eve is not\n",
  });
  const out = check(dir);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /^README\.md:3: private word 1 of \.private-words$/m);
  assert.match(out.stderr, /^src\/a\.mjs:2: private word 3 of \.private-words$/m);
  assert.match(out.stderr, /^notes\.txt:1: private word 2 of \.private-words$/m);
  assert.match(out.stderr, /privacy check: FAIL \(3 hits\)/);
  assert.doesNotMatch(out.stderr, /Mallory/);
});

test("a word in a file name fails too; words match case-sensitively", () => {
  const dir = folder({ ".private-words": WORDS, "docs/Mallory-notes.md": "mallory, eve\n" });
  const out = check(dir);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /^docs\/Mallory-notes\.md:file name: private word 1/m);
  assert.match(out.stderr, /FAIL \(1 hit\)/);
});

test("a clean folder passes; in a git repo, ignored files are not checked", () => {
  const dir = folder(
    {
      ".private-words": WORDS,
      ".gitignore": "node_modules\n.private-words\nlocal.txt\n",
      "README.md": "# Corner Bakery\n\nTasks T.1 and B.2.\n",
      "local.txt": "Mallory was here\n",
      "node_modules/x/index.js": "Mallory\n",
    },
    { git: true },
  );
  const out = check(dir);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /privacy check: PASS \(2 files\)/);
});

test("no .private-words: skipped and passes", () => {
  const out = check(folder({ "README.md": "Mallory\n" }));
  assert.equal(out.status, 0);
  assert.equal(out.stdout.trim(), "no .private-words: skipped");
});
