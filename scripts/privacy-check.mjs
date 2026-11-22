// Fails, naming file and line, when a file git would commit holds a word from .private-words.
// .private-words (git-ignored, never committed): one word per line, matched case-sensitively anywhere in a line;
// a line starting with "re:" is a regular expression; empty lines and lines starting with "#" are skipped.
// Without the file the check is skipped and passes.
//   node scripts/privacy-check.mjs [folder]   (default: the repo this script is in)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WORDS_FILE = ".private-words";

/** The rules in a .private-words text: { label, test(line) } per word. */
export function parseWords(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, i) => {
      const label = `word ${i + 1}`;
      if (line.startsWith("re:")) {
        const re = new RegExp(line.slice(3));
        return { label, test: (s) => re.test(s) };
      }
      return { label, test: (s) => s.includes(line) };
    });
}

// The files git would commit: tracked plus untracked that are not ignored. Without git, every file except
// node_modules and .git.
function filesOf(folder) {
  if (existsSync(join(folder, ".git"))) {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: folder,
      encoding: "utf8",
    });
    return out.split("\0").filter((f) => f && existsSync(join(folder, f)));
  }
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name === WORDS_FILE) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else found.push(relative(folder, path));
    }
  };
  walk(folder);
  return found;
}

/**
 * Every hit in the folder: { file, line, rule } (line 0 = the file's name). The rule is "word N" (its line in
 * .private-words, counting only words), so the output never repeats the private word itself.
 * @returns {{ skipped: true } | { skipped: false, files: number, hits: { file: string, line: number, rule: string }[] }}
 */
export function privacyCheck(folder) {
  const wordsPath = join(folder, WORDS_FILE);
  if (!existsSync(wordsPath)) return { skipped: true };
  const rules = parseWords(readFileSync(wordsPath, "utf8"));
  const hits = [];
  const files = filesOf(folder).filter((f) => f !== WORDS_FILE);
  for (const file of files) {
    for (const rule of rules) if (rule.test(file)) hits.push({ file, line: 0, rule: rule.label });
    const data = readFileSync(join(folder, file));
    if (data.includes(0)) continue; // a picture or other binary file
    data
      .toString("utf8")
      .split("\n")
      .forEach((text, i) => {
        for (const rule of rules) if (rule.test(text)) hits.push({ file, line: i + 1, rule: rule.label });
      });
  }
  return { skipped: false, files: files.length, hits };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const folder = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const result = privacyCheck(folder);
  if (result.skipped) {
    console.log("no .private-words: skipped");
  } else if (result.hits.length === 0) {
    console.log(`privacy check: PASS (${result.files} files)`);
  } else {
    for (const { file, line, rule } of result.hits)
      console.error(`${file}:${line || "file name"}: private ${rule} of ${WORDS_FILE}`);
    console.error(`privacy check: FAIL (${result.hits.length} hit${result.hits.length === 1 ? "" : "s"})`);
    process.exit(1);
  }
}
