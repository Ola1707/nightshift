// Reads the roadmap Markdown files into tasks for the board.
// A task is an open checkbox line: "+ [ ]" has a prompt, "- [ ]" has none yet.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ITEM = /^\s*([-+]) \[ \] (.*)$/;
const HEADING = /^(#{1,3}) (.*)$/;
const CODE_IN_PARENS = /\(([0-9A-Z]+[A-Za-z]*\.[\w.]+)\)/;
const CODE_AT_START = /^([0-9A-Z]+[A-Za-z]*\.[\w.]*\d[\w.]*)\b/;

// Items in `saved` first, in its order, then the rest in their old order.
const rankBy = (saved, key) => (item) => {
  const i = saved.indexOf(key(item));
  return i === -1 ? saved.length : i;
};

export function sortRoadmapFiles(files, saved = [], defaultOrder = []) {
  const bySaved = rankBy(saved, (f) => f);
  const byDefault = rankBy(defaultOrder, (f) => f);
  return [...files].sort(
    (a, b) => bySaved(a) - bySaved(b) || byDefault(a) - byDefault(b) || a.localeCompare(b),
  );
}

export function sortPhases(phases, saved = []) {
  const rank = rankBy(saved, (p) => p.name);
  return phases
    .map((p, i) => [p, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([p]) => p);
}

const plain = (text) =>
  text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/_\((.+?)\)_/g, "($1)")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

function codeOf(title, heading) {
  return (
    title.match(CODE_IN_PARENS)?.[1] ??
    title.match(CODE_AT_START)?.[1] ??
    heading?.match(CODE_AT_START)?.[1] ??
    null
  );
}

function parseItem(marker, text, heading) {
  const bold = text.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  const title = plain(bold ? bold[1] : text.split(/(?<=[a-z)\]`]\.)\s|\s_\(/)[0]);
  const details = plain(bold ? bold[2] : text.slice(text.indexOf(title) + title.length));
  return {
    code: codeOf(title, heading),
    title: title.replace(/\.$/, ""),
    details,
    hasPrompt: marker === "+",
  };
}

// Groups by "# Phase …" when a file has several of them, else by "## …".
export function parseRoadmap(markdown, file) {
  const lines = markdown.split("\n");
  const h1Count = lines.filter((l) => /^# /.test(l)).length;
  const phaseLevel = h1Count > 1 ? 1 : 2;
  const phases = [];
  let phase = null;
  let sub = null;
  let inFence = false;
  const seen = new Set();

  for (const line of lines) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      if (level === phaseLevel) {
        phase = { name: plain(heading[2]), tasks: [] };
        phases.push(phase);
        sub = null;
      } else if (level > phaseLevel) {
        sub = plain(heading[2]);
      }
      continue;
    }
    const item = line.match(ITEM);
    if (!item || item[2].startsWith("~~")) continue;
    if (!phase) {
      phase = { name: "Tasks", tasks: [] };
      phases.push(phase);
    }
    const task = parseItem(item[1], item[2], sub);
    let id = taskId(file, task);
    for (let n = 2; seen.has(id); n++) id = `${taskId(file, task)}~${n}`;
    seen.add(id);
    phase.tasks.push({ ...task, file, phase: phase.name, section: sub, id });
  }
  return phases.filter((p) => p.tasks.length > 0);
}

// Stable across edits elsewhere in the file: the roadmap code plus the start of the title.
export function taskId(file, task) {
  return `${file}#${task.code ?? ""}/${task.title.slice(0, 60)}`;
}

// A JSON task file: { title, intro, tasks: [task] } (docs/plan-tasks-json.md). Same task shape as a Markdown
// task, plus source "json", status, textOnly, impact, asked and doneWhen. The prompt text stays in the file.
export function parseTaskJson(data, file) {
  const seen = new Set();
  return (data.tasks ?? [])
    .filter((t) => t.status !== "dropped")
    .map((t) => {
      const task = { code: t.id ?? null, title: t.title ?? "", details: t.details ?? "" };
      let id = taskId(file, task);
      for (let n = 2; seen.has(id); n++) id = `${taskId(file, task)}~${n}`;
      seen.add(id);
      return {
        ...task,
        hasPrompt: Boolean(t.prompt),
        file,
        phase: "Tasks",
        section: null,
        id,
        source: "json",
        status: t.status ?? "open",
        textOnly: Boolean(t.textOnly),
        impact: t.impact ?? {},
        asked: t.asked ?? null,
        doneWhen: t.doneWhen ?? "",
      };
    });
}

// order: { roadmaps: [file], phases: { [file]: [phase name] } }, saved by the board's "Send order to Claude".
// config: the board settings (config.mjs): taskFiles, roadmaps { pattern, exclude, order, titlePrefix }.
export function readRoadmaps(roadmapDir, order = {}, config) {
  const night = config.taskFiles.map(({ file: name, title, planOnly = false }) => {
    const base = name.replace(/\.(md|json)$/, "");
    const jsonFile = `night-run/${base}.json`;
    if (existsSync(join(roadmapDir, jsonFile))) {
      const data = JSON.parse(readFileSync(join(roadmapDir, jsonFile), "utf8"));
      return { file: jsonFile, title, planOnly, tasks: parseTaskJson(data, jsonFile) };
    }
    const file = `night-run/${base}.md`;
    const path = join(roadmapDir, file);
    const tasks = existsSync(path)
      ? parseRoadmap(readFileSync(path, "utf8"), file).flatMap((p) => p.tasks)
      : [];
    return { file, title, planOnly, tasks };
  });
  const { pattern, exclude, order: defaultOrder, titlePrefix } = config.roadmaps;
  const matches = new RegExp(pattern);
  const prefix = titlePrefix ? new RegExp(titlePrefix) : null;
  const files = readdirSync(roadmapDir).filter((f) => matches.test(f) && !exclude.includes(f));
  const other = sortRoadmapFiles(files, order.roadmaps, defaultOrder)
    .map((file) => {
      const markdown = readFileSync(join(roadmapDir, file), "utf8");
      const heading = plain(markdown.match(/^# (.*)$/m)?.[1] ?? file);
      const title = prefix ? heading.replace(prefix, "") : heading;
      return {
        file,
        title,
        phases: sortPhases(parseRoadmap(markdown, file), order.phases?.[file]),
      };
    })
    .filter((r) => r.phases.length > 0);
  return { night, other };
}
