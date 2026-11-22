# Nightshift

Nightshift is a small local website (the board) for unattended Claude Code runs. Before you leave, you pick the
night's tasks from your roadmap files; Claude works through them and writes what it did into a `run.json`. In the
morning you review the run on the board: before and after screenshots, tests, decisions Claude made alone, QA ticks.

Install and the Claude Code plugin: coming.

## Start

```sh
nightshift serve          # the board for the project in this folder: http://localhost:8095
```

`BOARD_PROJECT=<folder>` serves another project folder, `BOARD_PORT=<port>` another port. The board listens on
127.0.0.1 only and has no build step; its one package is `sharp` (decoding pictures for the blank-picture check).

Other commands, each for the project in the current folder (or `BOARD_PROJECT`):

| Command | What it does |
| --- | --- |
| `nightshift flow [id]` | prints the merged flow of work, or one type of change, as JSON |
| `nightshift checklist` | prints the plan checklist's three lists: `{ approve, claude, both }` |
| `nightshift checklist-import` | sets every checklist tick from a "Plan checklist choices" text on stdin |
| `nightshift config` | prints the merged settings |

While developing Nightshift itself, `NIGHTSHIFT_DEV_DIR=<your working copy>` makes any installed `nightshift` run
that copy instead.

## The pages

1. **Pick tasks** (`/`). At the top, **Decisions from last night**: every decision Claude made alone that you have
   not ticked yet, from every run, with an "OK" checkbox and a text box (saved into that run's `qa.json`). Then every
   open task in the task files (one section per type of change), with **Check all night work** (every open task
   except Manual ones) and **Uncheck all**, then the other roadmaps grouped by phase. Drag a roadmap or a phase by
   its **⠿** handle to reorder it; **Send order to Claude** saves `board-order.json`, and Claude reorders the files
   when you say "order sent". `+ [ ]` shows "prompt ✓", `- [ ]` shows "needs prompt". The title tags
   `[Native build]`, `[Policy]` and `[Manual]` show as chips; Manual boxes are faded. Each box has a **📝 note** for
   something important or a question for Claude.
2. **Tonight's list** (`/list`): what was saved, with the next step: tell Claude "night board ready".
3. **Review a run** (`/review`): reads `<runs>/<run>/run.json`. QA ticks and problem notes, answers to questions,
   ticks on decisions and notes on fixed tests are saved in `<runs>/<run>/qa.json`. A shot that is almost one color
   shows a "Blank picture" chip, a shot whose file is gone a "Missing picture" chip; a video plays as a silent loop.
   **Review done** writes `review.json` and the review into each release log the run names; **Reopen the review**
   asks first. Until a run's review is done, every page shows ⏳ for it, and deploys to the environments in
   `gate.holdUntilReviewed` are refused by `reviewGateProblem` (see "Use in your scripts").
4. **Flow** (`/flow`): how work goes for each type of change (small fix, bug, visual change, feature, big feature,
   infrastructure, night run, review), with an **Approve** button per type. An approval stops counting when the
   type changes.
5. **Checklist** (`/checklist`): what goes in every feature plan. Tick who handles each item: the owner approves
   (one line in the plan, a yes or no) or Claude does (always in the plan). Add items of your own.

A click on any picture link opens it in a modal on the same page.

## Files Claude and the board share

Paths are the defaults; each can be changed in the settings file.

| File | Written by | What it holds |
| --- | --- | --- |
| `docs/roadmap/night-run/<type>.md` | you, Claude | the task files, one per type of change; an open task is a `+ [ ]` or `- [ ]` line |
| `docs/roadmap/roadmap*.md` | you, Claude | the other roadmaps, grouped by `# Phase` or `##` sections |
| `docs/roadmap/night-run/board-picks.json` | board | the tasks picked for tonight |
| `docs/roadmap/night-run/board-notes.json` | board | your notes and questions on tasks |
| `docs/roadmap/night-run/board-order.json` | board | the order of the roadmaps and their phases |
| `docs/roadmap/night-run/next-night-run.md` | board, Claude | the picks and the notes again, between `<!-- board:picks -->` and `<!-- board:notes -->` markers |
| `docs/release-log/<run>/run.json` | Claude | everything the run's summary says (below) |
| `docs/release-log/<run>/qa.json` | board | your ticks and notes, `{ checked, note, at }` per key |
| `docs/release-log/<run>/review.json` | board | `{ done, at }`, written by "Review done" |
| `docs/board/flow.json` | you, Claude, board | your changes to the flow of work, and the approvals |
| `docs/board/plan-checklist.json` | board | your checklist ticks and added items |

Keys in `qa.json`: a task's id (QA tick, problem or answer), `decision:<id>`, `failure:<test>` (a note on a fixed
test) and `proposed:<id>` (ticked = add it as an action item).

The phrases Claude listens for: "night board ready" (the picks are saved), "order sent" (reorder the roadmaps),
"Review done" (the review is finished).

## run.json

Claude writes it next to the run's Markdown summary, in `<runs>/<night-run|day-run>-<date>/run.json`, with
everything the summary says. Paths are repo-relative or full URLs. Every key except `title` and `tasks` may be left
out.

```jsonc
{
  "title": "Night run 2030-01-05",
  "date": "2030-01-05",
  "summary": "docs/release-log/night-run-2030-01-05.md",
  "links": [{ "label": "PR #12 (the run)", "url": "https://github.com/example/corner-bakery/pull/12" }],
  "you": ["What you must do first"],
  "notDeployed": "Why nothing was deployed, or leave it out",
  "deploys": [{ "env": "Staging", "what": "API and website", "log": "docs/release-log/staging-2030-01-05_0300.md" }],
  "built": ["Short bullet per thing built"],
  // The run's own decisions (not one task's).
  "decisions": [{ "id": "run-1", "text": "Deployed to staging only." }],
  "tasks": [
    {
      "id": "T.1", // the task's code; the QA tick is saved under it
      "title": "Website: show the opening hours",
      "type": "small-fix", // small-fix | bug | visual-change | feature | big-feature | infrastructure | other
      "status": "done", // done | partial | not-done
      "done": "What was done",
      "decisions": [{ "id": "T.1-1", "text": "Kept the hours in one line on phones." }],
      "missing": "What's missing to finish, or null",
      "qa": "Where to check (app and screen), or null when there is nothing to see",
      "questions": ["Questions for you, when there is no screen"],
      "before": [{ "label": "Home page", "path": "docs/release-log/night-run-2030-01-05/before/home.jpg" }],
      "after": [{ "label": "Home page", "path": "docs/release-log/night-run-2030-01-05/after/home.jpg" }],
      "videos": [{ "label": "Menu opens", "when": "after", "path": "docs/release-log/night-run-2030-01-05/after/menu.mp4" }],
      "tests": [{ "name": "web home.spec.ts 3", "what": "the hours show", "result": "failed before, passes after" }]
    }
  ],
  "testRuns": [
    {
      "suite": "Web",
      "result": "85 passed, 1 failed → fixed",
      "time": "4.1 min",
      "report": "tests/e2e/runs/2030-01-05-web/failures.html", // null when all passed
      "reportLabel": "2030-01-05-web"
    }
  ],
  "failures": [
    {
      "test": "web checkout.spec.ts 12",
      "app": "Shop",
      "platform": "web",
      "failedOn": "What it failed on",
      "failedStep": "The step that failed",
      "report": "tests/e2e/runs/2030-01-05-web/failures.html#checkout-12", // the card's "Steps" link
      "screenshot": "docs/release-log/night-run-2030-01-05/failures/checkout-12.png",
      "fixedIn": "app", // app | test | not fixed
      "fixFile": "checkout.tsx",
      "explanation": "One short line: what the fix was"
    }
  ],
  "sections": [{ "title": "Ruled out on the way", "items": ["Any other summary part, one list each"] }],
  "stillOpen": [{ "topic": "Bugs", "items": ["B.2: waits for your answer"] }],
  // Items Claude would add to a roadmap; you decide. Plain strings count by their number (1, 2, …).
  "proposed": [{ "id": "P1", "text": "What, where, done when" }]
}
```

## Settings: board.config.json

In the project's root folder. Every key is optional; objects merge key by key with the defaults, lists replace
them. `nightshift config` prints the result.

| Key | Default | What it is |
| --- | --- | --- |
| `schemaVersion` | `1` | the settings format |
| `owner` | `"you"` | the owner's name on the board ("<owner> approves", "Notes and questions from <owner>") |
| `port` | `8095` | the board's port (`BOARD_PORT` wins) |
| `paths.roadmaps` | `"docs/roadmap"` | the roadmap files |
| `paths.tasks` | `"docs/roadmap/night-run"` | the task files and the board's picks, notes and order |
| `paths.runs` | `"docs/release-log"` | the run folders and release logs |
| `paths.board` | `"docs/board"` | the project's `flow.json` and `plan-checklist.json` |
| `paths.served` | `["docs"]` | the only folders the board serves files from (screenshots, videos, reports) |
| `nextRunFile` | `"next-night-run.md"` | the file in `paths.tasks` that gets the picks and notes sections |
| `taskFiles` | six files: `small-fix.md`, `bug.md`, `visual-change.md`, `feature.md`, `big-feature.md`, `infrastructure.md` | `[{ file, title, planOnly? }]`, the task files in `paths.tasks`, in order; `planOnly` marks tasks that are planned, never done unattended |
| `roadmaps.pattern` | `"^roadmap(-.+)?\\.md$"` | which files in `paths.roadmaps` are roadmaps |
| `roadmaps.exclude` | `[]` | roadmap files to leave out |
| `roadmaps.order` | `[]` | the default order of the roadmaps (the board's saved order wins) |
| `roadmaps.titlePrefix` | `""` | a regular expression cut from the start of each roadmap's title |
| `suites` | `[]` | the project's test suites: `[{ id, run, … }]` |
| `apps` | `[]` | the project's apps, by name |
| `skills` | `{}` | the project's own skill names, by role |
| `gate.holdUntilReviewed` | `[]` | environments that get no deploy while a run waits for its review |
| `reviewMode.alsoGuard` | `[]` | extra folders guarded during a review |

Example:

```json
{
  "owner": "Sam",
  "paths": { "served": ["docs", "tests/e2e/runs"] },
  "roadmaps": { "exclude": ["roadmap-archive.md"], "titlePrefix": "^Corner Bakery Roadmap — " },
  "gate": { "holdUntilReviewed": ["production"] },
  "suites": [{ "id": "web", "label": "Web", "run": "npm run test:web" }]
}
```

The flow of work and the plan checklist start from `defaults/flow.json` and `defaults/plan-checklist.json`. The
project's `docs/board/flow.json` can replace a type (same id), add one (new id), hide one (`null`), and replace
`intro`, `always` and `eachDay`; `roles` merge key by key.

## Use in your scripts

```js
import { loadConfig, reviewGateProblem } from "nightshift-board";

const config = loadConfig(process.cwd());
const problem = reviewGateProblem("production", `${process.cwd()}/${config.paths.runs}`, {
  held: config.gate.holdUntilReviewed,
});
if (problem) throw new Error(problem);
```

Also exported: `unreviewedRuns`, `isBlankPicture` (true when a screenshot is almost one color), `runPictures` and
`pictureProblems`. Types are in `lib/index.d.mts`.

## Develop

```sh
npm install
npm test                  # node --test
npm run privacy           # the privacy check
```

The privacy check fails, naming file and line, when a file git would commit holds a word from `.private-words` (one
per line, `re:` for a regular expression). That file is git-ignored; without it the check is skipped. Turn on the
pre-push hook that runs it with `git config core.hooksPath .githooks`.

## License

MIT
