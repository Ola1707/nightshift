# Plan: task files as JSON

Status: planning with Ola, one point at a time. Nothing built yet.

## 1. Every task answers the impact list (Ola, 2026-11-24)

- Every task, even the smallest, answers each item of the flow's `impact` list (CPU, memory, disk, native, policy,
  cost, security & privacy, database migration, older app versions). Exception: a task that only changes wording
  (the planner marks it `"textOnly": true`); a small fix with a spacing tweak still answers.
- Answered while the prompt is written (`write-a-prompt`, `plan-night-run` part 2), by the planner (Opus), not
  later.
- Each answer is one of three, with a short note when it isn't "none":

  | Effect | Meaning | Icon on the board |
  |---|---|---|
  | `none` | no impact | grey dot |
  | `better` | makes it better (e.g. less memory) | green ▲ |
  | `worse` | makes it worse (e.g. +1 MB bundle) | red ▼ |

- In the task's JSON:
  ```json
  "impact": {
    "cpu": { "effect": "none" },
    "memory": { "effect": "better", "note": "cards unload after the animation" },
    "native": { "effect": "worse", "note": "new store build", "approved": "2026-11-24" }
  }
  ```
- **A `worse` answer needs the owner's own OK** for that item, asked while the prompt is written (one question per
  `worse` item). The OK is saved on the item (`approved`: the date). A task with a `worse` item without an OK is
  never coded, not even on a night run.
- The board shows a row of icons on every task (pick page, review page), one per impact item, the note on hover.
  A task with no answers yet shows "Impact not checked"; a `worse` item without an OK shows "Needs your OK". The run's summary shows the same row.

## 2. The prompt lives in the task (Ola, 2026-11-24)

- No separate prompts file: the task's JSON has a `prompt` field (Markdown). Skills read it from there.
- Old prompts files stay for tasks not converted yet.

## 3. A task's fields (Ola, 2026-11-24)

```json
{
  "id": "8A.2cv",
  "title": "Tap cooldown: one default, 1 s on Demo and 5 s everywhere else",
  "status": "open",
  "asked": { "by": "Ola", "on": "2026-11-23", "from": "review of day run 2026-11-12, P3" },
  "quote": "on the demo it's 1, in production and all other places 5 seconds",
  "details": "Markdown: what's wrong today, what's wanted",
  "doneWhen": "a unit test per environment, ...",
  "textOnly": false,
  "impact": {},
  "prompt": "Markdown",
  "done": { "on": "2026-11-23", "in": "night run 2026-11-23", "evidence": "program-form.test.ts failed first, then passed" },
  "reviews": [{ "on": "2026-11-23", "run": "night run 2026-11-23", "accepted": false, "note": "show only the relevant part" }],
  "links": ["https://github.com/.../pull/4"]
}
```

- `status`: `open` → `built` (done by a run, waits for the review) → accepted in the review → the task **moves to the
  done file** (`<type>-done.json` next to it, e.g. `bug-done.json`), so the open file stays short, easy to read and
  cheap to load. Not accepted → back to `open` with the review note.
- Done by code (`server/task-review.mjs`, Ola, 2026-11-24): **Review done** settles each task of the run. A tick
  accepts; a note without a tick rejects; a task the run finished (`done`) with no note is accepted. Reopening a
  review moves nothing back. The `tasks-json` conversion does the same for `[x]` items whose run review is already
  done, newest run first (the newest verdict decides). A partly done task with no tick stays `built` for the owner.
- `dropped` (the owner doesn't want it) also moves to the done file, with the reason.

## 4. Where the files live (Ola, 2026-11-24)

- Same folder (`paths.tasks`), same name: `bug.md` → `bug.json`; the conversion deletes the `.md` (git keeps it).
  `board.config.json` doesn't change (`taskFiles[].file` may say `bug.md` or `bug.json`; the board looks for both).
- The board reads `<name>.json` when it exists, else `<name>.md`. Roadmaps (`roadmap-*.md`) stay Markdown.
- A task file's JSON: `{ "title": "Bugs", "intro": "Markdown", "tasks": [ ... ] }`; the done file
  `<name>-done.json` has the same shape.
- The conversion copies each task's prompt from the project's prompts files into its `prompt` and removes it there.
  Prompts of roadmap items stay where they are.

## 5. `/nightshift:update` (Ola, 2026-11-24)

- Nothing changes under the owner's nose: a new Nightshift version only adds updates to a list
  (`defaults/updates.json`: `id`, `title`, `what` (plain words), `changes` (files), `undo`).
- `nightshift updates` prints the ones not answered yet; `nightshift update <id>` applies one (code, tested);
  the answer is saved in `board.config.json` → `"updates": { "<id>": "applied" | "skipped" }`.
- The skill asks, with GUI questions, which of the new ones to apply, runs them, and says what changed.
- First update: `tasks-json` (point 4). Later: a board page with the same list.

## 6. What changes

- Board: reads JSON task files; every task shows its impact row (grey dot / green ▲ / red ▼, note on hover),
  "Impact not checked", "Needs your OK"; review page the same for the run's tasks (`run.json` tasks get `impact`).
- Skills: `write-a-prompt` and `plan-night-run` answer the impact list and ask the OK for each `worse` item, and
  write the prompt into the task; `do`, `start-review` and `run-night-run` read and write tasks in the JSON (built →
  review → done file); `run-night-run` never codes a task with a `worse` item without an OK. A project not converted
  yet keeps the Markdown way.
