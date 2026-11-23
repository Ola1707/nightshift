---
name: plan-night-run
description: Plan the night run on the Nightshift board (package nightshift-board): the user picks tonight's tasks, Claude writes the missing prompts one item at a time, asks the run's questions and starts the run; the board also shows the finished run for review. Use whenever the user types /nightshift:plan-night-run, says "plan night run", "plan tonight", "night board", "open the board", "I want to pick tonight's tasks", "night board ready", "I picked the tasks", or wants to see or review a run on the board — even if they don't say "board".
---

# Plan night run

## 0. The project's settings first

No `board.config.json` in the project yet: offer `/nightshift:setup` first.

1. Run `pnpm exec nightshift config` (or `npx nightshift config`). It prints the project's settings as JSON: `owner`,
   `port`, `paths` (`tasks`, `runs`, `board`, `roadmaps`), `taskFiles`, `suites`, `skills`, `gate`. Below, "the
   tasks folder" is `paths.tasks`, "the runs folder" is `paths.runs`, and so on.
2. Then the project's own rules: run `pnpm exec nightshift rules plan-night-run --plugin <plugin>` (`<plugin>` is two folders
   up from this skill's base directory) and follow `<plugin>/project-rules.md`: read each `OK` file (it adds to this
   skill and wins where they differ); a `CHANGED` file is gone through first.

**Rule 1:** everything you write for the owner follows `<plugin>/rule-1.md` (new information only).

The board is a local website in the package `nightshift-board` (file formats and pages:
`node_modules/nightshift-board/README.md`). Its pages: pick (`/`), list (`/list`), review (`/review`), flow (`/flow`),
checklist (`/checklist`).

## 1. Open it

- Start it in the background: `pnpm exec nightshift serve` (or `npx nightshift serve`), on `port` (`BOARD_PORT`
  wins). If that port already answers, it is running.
- Reply with the link only: `http://localhost:<port>`

## 2. Prompt planning (A, any day before the night run)

When the user says "plan prompts" (or picks tasks with no prompt):

1. List the open items with no prompt (`- [ ]`, `hasPrompt: false`) from the task files and roadmaps, short, one
   line each, and let the user pick which to write prompts for (GUI, multi-select).
2. **One item at a time:** ask that item's questions (AskUserQuestion, a recommended option first), let the user ask
   and answer back, then write its prompt (the project's prompt skill, `skills.prompt`; without one,
   `/nightshift:write-a-prompt`) and flip its line from `- [ ]` to `+ [ ]`. Only then go to the next item. Never
   collect the questions of several items into one round.
3. End with the list: each item, prompt written or skipped.

## 3. The user picks, then says "night board ready"

1. Read `board-picks.json` in the tasks folder (the same list is in the `nextRunFile` there, between the
   `<!-- board:picks -->` markers).
2. **Notes.** Read `board-notes.json` in the tasks folder (task id → code, title, file, note). Answer every question
   there in the chat, short, one per task; treat the rest as instructions for that task (they go into its prompt and
   the run). Also do this whenever the user says "answer my notes" or "I left notes on the board". Never edit the
   notes; the user clears a note by emptying it.
   **Decisions from last night** (top of the pick page, `GET /api/open-decisions`): read the `decision:<id>` and
   `failure:<test>` notes in each run's `qa.json` and answer or act on them in the chat, like the task notes. Never
   tick a decision: only the user does.
   **Waiting for Claude** (`GET /api/waiting`): handle each by `<plugin>/review-actions.md` (`<plugin>` is two
   folders up from this skill's base directory): a "now" one before the run starts, a "later" one becomes a task.
3. **Prompts.** Check every chosen task has a prompt (`hasPrompt: true`). One without: do the prompt planning (part
   2) for those, one item at a time. Tasks in a task file marked `planOnly` get a plan, never code.
4. **The skills' rules, before the run.** Run `pnpm exec nightshift rules --plugin <plugin>` (every skill: the run
   uses several). For each `CHANGED` file, go through it now (`<plugin>/project-rules.md`, "After the plugin
   changed"); its conflicts join the round of questions below, and `--mark` follows the answers. The run never
   starts with a `CHANGED` file.
5. **Questions.** Collect what the run needs from the user (not prompt questions: those were asked in part 2) into
   **one round** of GUI questions
   (AskUserQuestion): real decisions only, short, a recommended option first. Add the reminders the project's
   rules files list.
6. Show the final list (task, prompt ready, decisions) in a few lines and wait for the user's OK.
7. Then the night run follows the project's run skill (`skills.run`). Without one: make a branch, do each task by
   its type's steps in the flow (`pnpm exec nightshift flow`), run each suite in `suites`, write the summary and
   `run.json` (part 4), and open one pull request, not merged.

## 4. During the run: fill run.json

A subagent writes `<runs folder>/<night-run|day-run>-<date>/run.json`, next to the run's Markdown summary, in the
format of `node_modules/nightshift-board/README.md`, following Rule 1 (`<plugin>/rule-1.md`): a task done as agreed
is "Done as planned.", no process, decisions say what changes for the owner, leftovers of old code are named.
Same content as the Markdown summary, plus:

- before / after screenshots and videos per task, copied into the run folder (repo-relative paths). A screenshot is
  the whole screen, taken with the suite's `screenshot` setting (a viewport, or a command for a device). Before
  saving, wait for the network to go idle, fonts (`document.fonts.ready`) and images to load, then run
  `isBlankPicture` (from the package `nightshift-board`) and retake once if blank. The review page shows a red
  "Blank picture" or "Missing picture" chip on a bad shot, and each video as a silent loop labelled "Video · N s" (a
  click opens it with sound);
- each new test, what it checks, and "failed before, passes after" when it reproduces a bug;
- each failed test with a screenshot of the failure (the suite's `failureShot` file, or the screenshot its runner
  saved), `fixedIn` app or test, and one short line on the fix;
- `qa` only for changes the user can see in an app;
- `stillOpen` grouped by category (one topic each), and `proposed: [{ id, text }]` (each gets an "Add as an action
  item" tick and a comment box on the review page);
- a task not done (or partly) with more than one way forward: each in `solutions: [{ id, text }]` on the task (one
  short line each: what it is and what it costs), not in `missing`. The owner picks Do it now, Do it later or
  neither per solution;
- every decision made alone in `decisions: [{ id, text }]`: on its task, or at the top of run.json for the run's
  own. You write the `id` (e.g. "T.1-1"), unique within the run, so a tick stays on its decision when run.json is
  written again. Not in the task's `done` text, and no "Decisions made alone" section. The user ticks them; never
  tick one yourself. Only a choice made without the user that changes what they get: never something done with
  their OK or decided together, and never temporary working steps that leave nothing behind (throwaway scripts,
  rebuilds, removed test apps, merge conflicts).

Commit `run.json` and the run's pictures together with the run's summary, and later `qa.json` and `review.json` with
the review. Every picture `run.json` points to must exist (`pictureProblems` from the package `nightshift-board`
lists the missing ones).

Never write `qa.json`: that holds the user's ticks.

## 5. Morning review

Give the link `http://localhost:<port>/review`. When the user reviews, read `qa.json` in the run folder:

- a tick = the user checked it;
- a note on a QA task = a problem, which goes through the Bug flow (skill `start-review`);
- a note on a task without QA = the user's answer to its questions or a note for Claude: answer or act on it in the
  chat. Every task on the page has a text box;
- a `decision:<id>` key = a decision: `checked` = the user is fine with it; a note = their question or remark on it
  (a note without a tick leaves it open): answer or act on it in the chat;
- a `failure:<test>` note = a remark on a fixed failed test: answer or act on it in the chat;
- a `proposed:<id>` key = a proposed item: `checked` = write it as a new action item (in the roadmap or task file it
  belongs to, with the user's comment folded in); a note = their comment or question on it: answer or act on it in
  the chat.

Never tick a decision yourself; an unticked one doesn't block Review done or a deploy, it shows on the pick page
under "Decisions from last night" until the user ticks it.

At the bottom of the page the user presses **Review done** (it writes `review.json` next to `run.json`; "Reopen the
review" undoes it). Until then:

- **Suggest the review every day:** at the start of a day's work or of planning a night run, check for runs still
  waiting (`unreviewedRuns` from the package `nightshift-board`, or the ⏳ in the board's top bar) and offer the
  review link first, in one line.
- **No deploy to a held environment:** deploys to the environments in `gate.holdUntilReviewed` are refused while any
  run waits for its review (`reviewGateProblem` from the package). Other environments are never held back. Don't
  work around it: ask the user to finish the review.
- Never write `review.json` yourself.
