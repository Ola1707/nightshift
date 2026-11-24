// Converts Markdown task files (and their prompts) to JSON task files (docs/plan-tasks-json.md, points 3-4).
//   convertTaskFile(mdText, { promptsByCode })  the JSON object of one task file
//   convertProject(projectDir, config)          every <paths.tasks>/*.md task file without a .json yet;
//                                               dropped items go to <base>-done.json
// Nothing is dropped: what can't be split cleanly stays whole in `details`.
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { settleReviewedRuns } from "./task-review.mjs";

const ITEM = /^([-+]) \[([ xX])\] (.*)$/;
const CODE_IN_PARENS = /\s*\(([0-9A-Z]+[A-Za-z]*\.[\w.]+)\)$/;
const ASKED = /_\(([A-Za-z][\w ]*), (\d{4}-\d{2}-\d{2})(.*?)\)_ ?/;
const FROM = /^,\s*(from [^"]*?)(?::\s*"([^"]*)")?$/;

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const plainWords = (s) => s.replace(/[*_`]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function parseItem(marker, box, first, rest) {
  let text = first;
  let title;
  const bold = text.match(/^\*\*(.+?)\*\*\s*/);
  if (bold) {
    title = bold[1];
    text = text.slice(bold[0].length);
  } else {
    const cut = text.search(/(?<=[a-z)\]`]\.)\s|\s_\(/);
    title = cut === -1 ? text : text.slice(0, cut);
    text = cut === -1 ? "" : text.slice(cut).trimStart();
  }
  title = title.replace(/\.$/, "").trim();
  const code = title.match(CODE_IN_PARENS)?.[1] ?? null;
  if (code) title = title.replace(CODE_IN_PARENS, "").trim();
  let asked = null;
  const whole = [text, ...rest.map((l) => l.replace(/^ {1,2}/, ""))].join("\n").trim();
  let details = whole;
  const m = whole.match(ASKED);
  if (m) {
    const tail = m[3].trim();
    const from = tail ? tail.match(FROM) : null;
    if (!tail || from) {
      asked = { by: m[1], on: m[2] };
      if (from) {
        asked.from = from[1];
        if (from[2]) asked.quote = from[2];
      }
      details = (whole.slice(0, m.index) + whole.slice(m.index + m[0].length)).trim();
    }
  }
  const done = box !== " ";
  const dropped = !done && title.startsWith("~~");
  if (dropped) title = title.replace(/~~/g, "").trim();
  return {
    id: code ?? slug(title),
    title,
    status: done ? "built" : dropped ? "dropped" : "open",
    ...(asked && { asked: { by: asked.by, on: asked.on, ...(asked.from && { from: asked.from }) } }),
    ...(asked?.quote && { quote: asked.quote }),
    details,
    doneWhen: "",
    textOnly: false,
    impact: {},
    prompt: "",
    reviews: [],
    links: [],
    hadPrompt: marker === "+",
  };
}

/** A prompts file as { sections: [{ heading, start, end }] } over its lines (headings of any level, not in fences). */
function promptSections(lines) {
  const heads = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (line.startsWith("```")) fence = !fence;
    const h = !fence && line.match(/^(#{1,6}) (.*)$/);
    if (h) heads.push({ level: h[1].length, heading: h[2], start: i });
  });
  return heads.map((h, n) => {
    const next = heads.slice(n + 1).find((x) => x.level <= h.level);
    return { ...h, end: next ? next.start : lines.length };
  });
}

const hasCode = (heading, code) =>
  new RegExp(`(?<![\\w.])${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w]|\\.\\w)`).test(heading);

/** Parses one Markdown task file. promptsByCode: { [code]: prompt Markdown }. */
export function convertTaskFile(mdText, { promptsByCode = {} } = {}) {
  const lines = mdText.split("\n");
  let title = "";
  const intro = [];
  const tasks = [];
  let current = null;
  let fence = false;
  const flush = () => {
    if (!current) return;
    tasks.push(parseItem(...current));
    current = null;
  };
  for (const line of lines) {
    if (line.startsWith("```")) fence = !fence;
    const item = !fence && line.match(ITEM);
    if (item) {
      flush();
      current = [item[1], item[2], item[3], []];
    } else if (current && (fence || /^\s/.test(line) || (line === "" && !fence))) {
      current[3].push(line);
    } else if (!fence && /^# /.test(line) && !title) {
      title = line.slice(2).trim();
    } else {
      flush();
      if (!/^## Open\s*$/.test(line)) intro.push(line);
    }
  }
  flush();
  return {
    title,
    intro: intro.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    tasks: tasks.map(({ hadPrompt, ...t }) => ({ ...t, prompt: promptsByCode[t.id] ?? "" })),
  };
}

/** Words of an original item that are in no field of the converted task (should be empty). */
export function lostWords(rawText, task) {
  const have = new Set(
    plainWords([task.id, task.title, task.details, task.quote ?? "", ...Object.values(task.asked ?? {})].join(" ")),
  );
  return [...new Set(plainWords(rawText))].filter((w) => !have.has(w));
}

/** The raw text (first line and continuation) of each item of a task file, in order. */
export function rawItems(mdText) {
  const out = [];
  let fence = false;
  for (const line of mdText.split("\n")) {
    if (line.startsWith("```")) fence = !fence;
    const item = !fence && line.match(ITEM);
    if (item) out.push(item[3]);
    else if (out.length && (fence || /^\s/.test(line))) out[out.length - 1] += "\n" + line;
  }
  return out;
}

// Prompt sections whose heading holds one of the codes: { [code]: text }, removed from the files when `write`.
function takePrompts(files, codes, write) {
  const found = {};
  for (const file of files) {
    let lines = readFileSync(file, "utf8").split("\n");
    let changed = false;
    for (const code of codes) {
      if (found[code]) continue;
      const sec = promptSections(lines).find((s) => hasCode(s.heading, code));
      if (!sec) continue;
      found[code] = lines.slice(sec.start, sec.end).join("\n").trim();
      lines = [...lines.slice(0, sec.start), ...lines.slice(sec.end)];
      changed = true;
    }
    if (changed && write) writeFileSync(file, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
  }
  return found;
}

/** The highest `number` in the project's JSON task files and done files (0 when none has one). */
function highestNumber(dir) {
  let max = 0;
  if (!existsSync(dir)) return max;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      const data = JSON.parse(readFileSync(join(dir, name), "utf8"));
      for (const t of data.tasks ?? []) if (Number.isInteger(t.number) && t.number > max) max = t.number;
    } catch {
      // not a task file
    }
  }
  return max;
}

/** The `number` a new JSON task gets: the highest in all task files and done files, plus 1. */
export function nextTaskNumber(projectDir, config) {
  return highestNumber(join(projectDir, config.paths.tasks)) + 1;
}

/**
 * Converts every task file of the project that has no .json yet. Returns { converted, prompts, skipped, files }
 * (files: { [file]: { items, prompts } }). With `outDir`, writes the results there and touches nothing in the project.
 */
export function convertProject(projectDir, config, { outDir } = {}) {
  const dir = join(projectDir, config.paths.tasks);
  const roadmapDir = join(projectDir, config.paths.roadmaps);
  const promptFiles = existsSync(roadmapDir)
    ? readdirSync(roadmapDir).filter((f) => /^claude-code-prompts.*\.md$/.test(f)).sort().map((f) => join(roadmapDir, f))
    : [];
  const report = { converted: [], prompts: 0, skipped: [], files: {}, lost: [] };
  const writes = []; // [name, data]; numbered after the loop: task files in taskFiles order, then done files
  const doneWrites = [];
  for (const { file } of config.taskFiles) {
    const base = file.replace(/\.(md|json)$/, "");
    const md = join(dir, `${base}.md`);
    const json = join(dir, `${base}.json`);
    if (existsSync(json)) report.skipped.push(`${base}.json already exists`);
    else if (!existsSync(md)) report.skipped.push(`${base}.md not found`);
    else {
      const text = readFileSync(md, "utf8");
      const first = convertTaskFile(text);
      const codes = first.tasks.map((t) => t.id);
      const prompts = takePrompts(promptFiles, codes, !outDir);
      const result = convertTaskFile(text, { promptsByCode: prompts });
      rawItems(text).forEach((raw, i) => {
        const words = lostWords(raw, result.tasks[i]);
        if (words.length) report.lost.push({ file: `${base}.md`, id: result.tasks[i].id, words });
      });
      const n = result.tasks.filter((t) => t.prompt).length;
      report.prompts += n;
      report.files[`${base}.md`] = { items: result.tasks.length, prompts: n };
      report.converted.push(`${base}.md`);
      const target = (name) => (outDir ? join(outDir, name) : join(dir, name));
      const dropped = result.tasks.filter((t) => t.status === "dropped");
      const open = { ...result, tasks: result.tasks.filter((t) => t.status !== "dropped") };
      writes.push([target(`${base}.json`), open]);
      if (dropped.length) {
        const done = { title: `${result.title} (done)`, tasks: dropped };
        doneWrites.push([target(`${base}-done.json`), done]);
        report.files[`${base}.md`].dropped = dropped.length;
      }
      if (!outDir) unlinkSync(md);
    }
  }
  let number = highestNumber(dir) + 1;
  for (const [path, data] of [...writes, ...doneWrites]) {
    data.tasks = data.tasks.map((t) => ({ number: number++, ...t }));
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  }
  // A ticked [x] item ("built") whose run review is already done: accepted → done file, rejected → open.
  if (!outDir && config.paths.runs) report.settled = settleReviewedRuns(projectDir, config, { only: ["built"] });
  return report;
}
