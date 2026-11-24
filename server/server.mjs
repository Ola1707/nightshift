// The board: pick tonight's tasks, see the list, review a finished run. Local only; one package (sharp, for the blank-picture check).
// Start: `nightshift serve` in the project folder (http://localhost:8095), or BOARD_PROJECT=<folder>.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { unreviewedRuns } from "./review-gate.mjs";
import { addItem, readChecklist, removeItem, setTick } from "./checklist.mjs";
import { loadConfig } from "./config.mjs";
import { openDecisions, openDecisionsOfRuns, waitingOfRuns } from "./decisions.mjs";
import { approveType, readFlow } from "./flow.mjs";
import { setImpactOk } from "./impact-ok.mjs";
import { readRoadmaps } from "./roadmaps.mjs";
import { pictureProblems, reportProblems } from "./run-pictures.mjs";
import { saveReview } from "./runs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(process.env.BOARD_PROJECT ?? process.cwd());
const CONFIG = loadConfig(REPO);
const ROADMAPS = join(REPO, CONFIG.paths.roadmaps);
const NIGHT = join(REPO, CONFIG.paths.tasks);
const PICKS = join(NIGHT, "board-picks.json");
const NOTES = join(NIGHT, "board-notes.json");
const ORDER = join(NIGHT, "board-order.json");
const NEXT_RUN = join(NIGHT, CONFIG.nextRunFile);
const RUNS = join(REPO, CONFIG.paths.runs);
const PORT = Number(process.env.BOARD_PORT ?? CONFIG.port);
const OWNER = CONFIG.owner;

// Screenshots, videos and reports the review page links to; nothing else in the repo is served.
const SERVED_ROOTS = CONFIG.paths.served.map((p) => join(REPO, p) + sep);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".zip": "application/zip",
};

const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

function send(res, status, body, type = TYPES[".json"]) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function body(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return JSON.parse(text || "{}");
}

function sendFile(res, path) {
  if (!existsSync(path) || !statSync(path).isFile()) return send(res, 404, { error: "not found" });
  send(
    res,
    200,
    readFileSync(path),
    TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
  );
}

// The picks also go into next-night-run.md, between markers, so the run-long-task skill finds them there.
const START = "<!-- board:picks -->";
const END = "<!-- /board:picks -->";

// The section replaces the one between its markers, or is added at the end of the file (the file is created when missing).
function writeSection(start, end, section) {
  const md = existsSync(NEXT_RUN) ? readFileSync(NEXT_RUN, "utf8") : "";
  const gap = md === "" ? "" : md.endsWith("\n\n") ? "" : md.endsWith("\n") ? "\n" : "\n\n";
  const next = md.includes(start)
    ? md.replace(new RegExp(`${start}[\\s\\S]*?${end}`), () => section)
    : `${md}${gap}${section}\n`;
  mkdirSync(dirname(NEXT_RUN), { recursive: true });
  writeFileSync(NEXT_RUN, next);
}

function writePicksToNextRun(picks) {
  const lines = picks.map(
    (t) =>
      `- ${t.hasPrompt ? "+" : "-"} ${t.code ? `**${t.code}** ` : ""}${t.title} — \`${t.file}\`${t.phase && !t.file.startsWith("night-run/") ? `, ${t.phase}` : ""}`,
  );
  const section = `${START}\n## Chosen on the board\n\nSaved ${new Date().toISOString().slice(0, 16).replace("T", " ")} from the AI board (\`+\` has a prompt, \`-\` needs one).\n\n${lines.join("\n") || "-"}\n${END}`;
  writeSection(START, END, section);
}

// The owner's notes and questions on tasks, for Claude to answer in the chat; also in next-night-run.md, between markers.
const NOTES_START = "<!-- board:notes -->";
const NOTES_END = "<!-- /board:notes -->";

function writeNotesToNextRun(notes) {
  const lines = Object.values(notes).map(
    (n) =>
      `- ${n.code ? `**${n.code}** ` : ""}${n.title} — \`${n.file}\`\n  > ${n.note.replace(/\n/g, "\n  > ")}`,
  );
  const section = `${NOTES_START}\n## Notes and questions from ${OWNER}\n\nWritten on the AI board; Claude answers them in the chat.\n\n${lines.join("\n") || "-"}\n${NOTES_END}`;
  writeSection(NOTES_START, NOTES_END, section);
}

function runFolders() {
  if (!existsSync(RUNS)) return [];
  const open = new Set(unreviewedRuns(RUNS));
  return readdirSync(RUNS)
    .filter((name) => existsSync(join(RUNS, name, "run.json")))
    .sort()
    .reverse()
    .map((name) => {
      const run = readJson(join(RUNS, name, "run.json"), {});
      return { name, title: run.title ?? name, date: run.date ?? null, reviewed: !open.has(name) };
    });
}

function runPath(name, file) {
  if (!/^[\w.-]+$/.test(name)) throw new Error("bad run name");
  return join(RUNS, name, file);
}

const routes = {
  "GET /api/roadmaps": () => readRoadmaps(ROADMAPS, readJson(ORDER, {}), CONFIG),
  // The order of the roadmaps and their phases, moved on the board; Claude then reorders the roadmap and prompt files.
  "POST /api/order": async (req) => {
    const { roadmaps, phases } = await body(req);
    const order = { savedAt: new Date().toISOString(), roadmaps, phases };
    writeJson(ORDER, order);
    return order;
  },
  "GET /api/picks": () => readJson(PICKS, { savedAt: null, tasks: [] }),
  "POST /api/picks": async (req) => {
    const { tasks } = await body(req);
    const picks = { savedAt: new Date().toISOString(), tasks };
    writeJson(PICKS, picks);
    writePicksToNextRun(tasks);
    return picks;
  },
  "GET /api/notes": () => readJson(NOTES, {}),
  "POST /api/notes": async (req) => {
    const { task, note } = await body(req);
    const notes = readJson(NOTES, {});
    const text = String(note ?? "").trim();
    if (text) {
      const { code = null, title, file } = task;
      notes[task.id] = { code, title, file, note: text, at: new Date().toISOString() };
    } else delete notes[task.id];
    writeJson(NOTES, notes);
    writeNotesToNextRun(notes);
    return notes;
  },
  // The owner's OK on a `worse` impact item of a JSON task (pick page checkbox); answers with the task's new impact.
  "POST /api/impact-ok": async (req) => {
    const { file, id, key, ok } = await body(req);
    return { impact: setImpactOk(ROADMAPS, CONFIG, { file, id, key, ok: Boolean(ok) }) };
  },
  "GET /api/config": () => ({
    owner: CONFIG.owner,
    taskFiles: CONFIG.taskFiles,
    suites: CONFIG.suites,
    apps: CONFIG.apps,
  }),
  // The flow of work (Flow page): the default laid over by the project's flow.json, with each type's approval.
  "GET /api/flow": () => readFlow(CONFIG, REPO),
  "POST /api/flow/approve": async (req) => {
    const { id, approved } = await body(req);
    return approveType(CONFIG, REPO, String(id), Boolean(approved));
  },
  // The plan checklist (Checklist page): the default items with the project's ticks and added items.
  "GET /api/checklist": () => ({ items: readChecklist(CONFIG, REPO) }),
  "POST /api/checklist/tick": async (req) => {
    const { id, approve, claude } = await body(req);
    return { items: setTick(CONFIG, REPO, String(id), { approve, claude }) };
  },
  "POST /api/checklist/add": async (req) => {
    const { name, description } = await body(req);
    return { items: addItem(CONFIG, REPO, { name, description }) };
  },
  "POST /api/checklist/remove": async (req) => {
    const { id } = await body(req);
    return { items: removeItem(CONFIG, REPO, String(id)) };
  },
  "GET /api/runs": () => runFolders(),
  // The pick page's "Decisions from last night": every unticked decision of every run.
  "GET /api/open-decisions": () => openDecisionsOfRuns(RUNS),
  // The pick page's "Waiting for Claude": reverts and picked solutions not handled yet.
  "GET /api/waiting": () => waitingOfRuns(RUNS, join(REPO, CONFIG.paths.board, "handled.json")),
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(url.pathname);
    const route = routes[`${req.method} ${path}`];
    if (route) return send(res, 200, await route(req));

    const run = path.match(/^\/api\/runs\/([^/]+)(\/qa|\/review)?$/);
    if (run && req.method === "GET" && !run[2]) {
      const runJson = readJson(runPath(run[1], "run.json"), null);
      const qa = readJson(runPath(run[1], "qa.json"), {});
      return send(res, 200, {
        run: runJson,
        // Shots the review page marks "Blank picture" or "Missing picture" instead of showing a broken image.
        pictures: runJson ? await pictureProblems(runJson, REPO) : {},
        // Test report pages (failures.html) the runs folder no longer has: the review page says so.
        reports: runJson ? reportProblems(runJson, REPO) : {},
        qa,
        // Decisions the owner has not ticked yet (they carry over to the pick page; they never block "Review done").
        openDecisions: runJson ? openDecisions(runJson, qa).length : 0,
        review: readJson(runPath(run[1], "review.json"), { done: false }),
      });
    }
    // "Review done" (or reopening it): deploys to the held environments wait for it (review-gate.mjs).
    // Open decisions never block it (runs.mjs).
    if (run && req.method === "POST" && run[2] === "/review") {
      const { done } = await body(req);
      return send(res, 200, saveReview({
          repo: REPO,
          runsDir: RUNS,
          runsPath: CONFIG.paths.runs,
          name: run[1],
          done,
          config: CONFIG,
        }));
    }
    if (run && req.method === "POST" && run[2] === "/qa") {
      const { taskId, checked, revert, do: doIt, note } = await body(req);
      const qaFile = runPath(run[1], "qa.json");
      const qa = readJson(qaFile, {});
      qa[taskId] = {
        checked: Boolean(checked),
        // Only decisions have Revert; OK and Revert never both.
        ...((revert === "now" || revert === "later") && !checked ? { revert } : {}),
        // Only solutions have do: "now" or "later"; none means don't.
        ...(doIt === "now" || doIt === "later" ? { do: doIt } : {}),
        note: String(note ?? ""),
        at: new Date().toISOString(),
      };
      writeJson(qaFile, qa);
      return send(res, 200, qa);
    }

    if (path.startsWith("/repo/")) {
      const file = normalize(join(REPO, path.slice("/repo/".length)));
      if (!SERVED_ROOTS.some((root) => file.startsWith(root)))
        return send(res, 403, { error: "not served" });
      return sendFile(res, file);
    }

    const page = {
      "/": "pick.html",
      "/list": "list.html",
      "/review": "review.html",
      "/flow": "flow.html",
      "/checklist": "checklist.html",
    }[path];
    return sendFile(res, join(HERE, "..", "public", page ?? normalize(path).replace(/^[/\\]+/, "")));
  } catch (error) {
    console.error(error);
    send(res, error.status ?? 500, { error: String(error.message ?? error) });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Nightshift board for ${REPO}: http://localhost:${PORT}  (list: /list, review: /review, flow: /flow, checklist: /checklist)`);
});
