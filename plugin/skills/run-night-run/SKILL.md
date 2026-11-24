---
name: run-night-run
description: Run a night run (or day run, or any unattended run while the owner is away) from start to summary - one round of questions, a plan file, coding subagents in parallel git worktrees, merging each back, checks, the test suites one at a time, deploy, a summary and run.json for the board, one pull request. Use whenever the owner gives tasks "for tonight", says they're going to sleep or away, says "start the night run", points to a run plan (night-run-<date>.md), or hands over a list of tasks to do unattended - even if they don't say "night run".
---

# Run a night run

## 0. The project's settings first

1. Run `pnpm exec nightshift config` (or `npx nightshift config`): `owner`, `paths` (`tasks`, `runs`, `roadmaps`,
   `board`), `taskFiles` (`planOnly`), `suites`, `skills` (`prompt`, `tests`), `gate.holdUntilReviewed`.
2. Then the project's own rules: run `pnpm exec nightshift rules run-night-run --plugin <plugin>` (`<plugin>` is two
   folders up from this skill's base directory) and follow `<plugin>/project-rules.md`: read each `OK` file (it adds
   to this skill and wins where they differ); a `CHANGED` file is gone through first. The project's file holds its
   commands: checks, deploy, ports, blockers and how its screenshots are taken.

**Rule 1:** everything you write for the owner follows `<plugin>/rule-1.md` (new information only).

## Part A: before the owner leaves

Tasks picked on the board (skill `nightshift:plan-night-run`) already did Part A: go to Part B.

The owner is usually leaving or going to sleep: replies are a few lines, only what's important.

1. **Take the tasks.** What the owner names, plus the open items of the task files in `paths.tasks` (offer them) and
   anything asked for that day. Give the facts the owner asks for with real numbers (e.g. "last Android run 20.0
   min, budget 30"). Prefer work that doesn't build on what the owner hasn't reviewed yet. Anything new
   that isn't in a task file yet: add it there first. A `planOnly` task file's items only get a plan (with a
   diagram), never code.
2. **All questions in one round**, in the GUI (AskUserQuestion), short:
   - Commit the docs written today first, so the agents see the new prompts? (default yes)
   - Deploy at the end (only if every suite passes)? Only to an environment not in `gate.holdUntilReviewed`.
   - Scope: "this list, add more?", naming every task by its name.
   - Plus the reminders the project's rules list.
   Decide everything else yourself. Never wake the owner later: decide, and write the decision into run.json
   `decisions[]` (Part C), where the owner ticks it on the board.
3. **Write the plan file** `<paths.tasks>/night-run-<date>.md` (or `day-run-<date>.md`):
   - The owner's answers (deploy, scope), "don't ask again".
   - Tasks table: # | Task | Where (link) | Prompt (yes / no: an Opus subagent writes it first / plan only /
     research, no code).
   - **Order:** tasks touching the same files go to one agent, in order; the rest run in parallel.
   - Checks, then deploy (Part B).
   - "Not in tonight": what was left out and why.
4. **Commit** the plan and any finished work, then tell the owner:
   - type `/nightshift:review-done` if review mode is on (it blocks code edits, even after `/clear`);
   - what else needs them before leaving (the project's rules list it);
   - then `/clear` and start the run with one line, in its own copy block:
     ```
     Start the night run in <paths.tasks>/night-run-<date>.md
     ```
   - If you start the run yourself instead, launch the coding agents (background) before your last message: a
     final message ends your turn and then nothing runs.

## Models

The main session only plans, starts subagents and decides. Each step is a subagent with `model:` set:

| Step | Model |
|---|---|
| Part A; missing prompts and plans | Opus |
| Start (B.1), merging agent branches + worktree cleanup (B.6), checks (B.7), watching a suite isn't stuck, deploy (B.10), the "Then" list | Haiku |
| Coding, merge conflicts, before/after screenshots, a task's tests, suites, fixing failures, blockers, summary + run.json | Sonnet |
| Deciding: stop a loop, what is a decision for `decisions`, what is flaky | Opus (main) |

A Haiku step that fails or needs judgment hands back to the main session, which sends it to Sonnet.

## Part B: the run

1. **Start** (Haiku): read the plan. Start the run's branch from an up-to-date `main` (merge conflicts → Sonnet;
   name the files in the summary). Free the ports the suites
   use. Keep the computer and screen awake for the whole run (macOS: `caffeinate -dims` in the background; check
   `pmset -g assertions`; not awake → fix it before any task). Keep a timeline of `date` lines in the scratchpad so times are real.
2. **Stay on the run's branch.** One branch, one pull request at the end.
3. **Impact:** never code a task with a `worse` impact item that has no `approved`; list it under "Not in tonight".
   Every task in the summary and in run.json carries its `impact`.
   **Prompts:** missing ones are written first by an Opus subagent with the prompt skill (`skills.prompt`, default
   `nightshift:write-a-prompt`), docs only.
4. **Code in parallel, each agent in its own worktree.** Sonnet subagents (`model: "sonnet"`: the prompts are
   written for Sonnet, faster and fewer credits) with
   `isolation: "worktree"`: each gets its own folder of the repo on its own branch, so agents never overwrite each
   other's files. One agent per group from the plan's Order; groups run at the same time. Agents run only the fast
   checks (typecheck, lint), never the suites (they share ports and devices). Research tasks write a Markdown file,
   no code.
5. **One task at a time to done:** coding runs in parallel, but each task is finished on its own before the next:
   merge it → a Sonnet agent runs **that task's tests** and fixes until they pass (verify first) → only then the **after**
   screenshots → done. **Before** screenshots are taken first, on the old code. Never take after screenshots of code
   that hasn't passed its tests; never leave several tasks half done: if the run stops, every finished task is done
   with its pictures.
   JSON task files: a finished task gets `status: "built"` and `done: { on, in, evidence }` in its task file
   (`<paths.tasks>/<type>.json`), not a ticked checkbox.
6. **Merge** (Haiku; conflicts → Sonnet) each agent's branch into the run's branch, then remove its worktree
   (`git worktree remove`) and delete its branch. Leftover worktrees break lint and tests.
7. **Checks after all merges** (Haiku): the project's checks (its rules file). Output to logs, PASS/FAIL only; read
   a log only on failure.
8. **The suites, one at a time** (`suites`), with the tests skill (`skills.tests`; without one, run each suite's
   `run` and fix, rerun with its `rerunFailed`), by a Sonnet subagent, never in the main session. Fix what fails and
   rerun the failed tests until they pass.
   - Failures go to subagents: one Sonnet subagent per failure (or per group touching the same files), in
     parallel, to investigate and fix. They don't run suites; the main session merges and reruns the failed tests
     in one call.
   - Don't loop: a test that fails again on the same thing after a fix, or after 4 fix rounds: stop, write it down,
     move on.
   - A suite slow across all its tests is likely the computer's load, not the app: compare with a quiet run first.
   - A test that fails and then passes on a rerun with nothing changed is flaky: list it under "Proposed items"
     (test, reason).
   - Every few minutes a Haiku subagent checks the running suite isn't stuck: its log keeps growing and the test it
     is on changes. No new output for ~10 min = stuck: kill it and its leftovers, fix the cause, rerun only the
     tests that didn't finish.
   - Never build apps while a suite runs: one after the other.
9. **Remove blockers** (Sonnet), never sit idle. The project's rules list its known ones. What truly needs the
   owner (a password, a card, a login): write the exact command in the summary and go on.
10. **Deploy** (Haiku) only if the owner said yes in Part A and every suite passed, only to an environment not in
    `gate.holdUntilReviewed`, with the project's deploy command. Anything failed: no deploy, say why.

## Part C: the summary (the owner reads it when back)

A Sonnet subagent writes the summary and `run.json`; the main session gives it the decisions and checks the result.
Haiku does the "Then" list.

Write `<paths.runs>/<night-run|day-run>-<date>.md`:

1. **Top:** pull request link, what's deployed where.
2. **Built:** short bullets.
3. **Tasks table:** # | Task | What was done | What's missing to finish | Before | After | You.
   - Before / After: the screenshots of that task's changed screens, as images in the cells; "—" when none.
   - "You" = **QA** (the app and the screen to check) for a change you can see; **Questions** when it has no screen;
     "—" when nothing.
   - Every decision made alone goes into run.json `decisions: [{ id, text, options }]` (`options`: 2–4
     `{ label, description }`, the first is what was done; the owner picks one on the board), on its task or at the
     top for the run's own. You write the `id`, unique within the run. Not in "What was done" and not in a section
     of its own. An unticked decision carries over to the next pick page and never blocks a deploy. Only real
     choices the owner must approve or know: not what they agreed to, not standing rules, not your own mistakes,
     not temp work. Never tick a decision yourself.
4. **Before and after screenshots of every changed screen** (opening the app to look is what takes the owner's
   time), taken and checked as skill `nightshift:plan-night-run` part 4 says (only the changed part, never blank),
   on the platforms and languages the project's rules list. Saved in the run folder, shown next to the task; the
   owner may pick some to keep. Still blank after a retake: say so, don't use it.
   - Infrastructure changes: a diagram instead of only text. Motion (an animation, a sheet opening): also a 3–5 s
     clip, before and after, of only the moment that moves.
5. **Test runs: a separate table** with real times. Each failed test: which test, what it failed on, a link to its
   screenshot, the app, and **Fixed** (the test / the app / not fixed / flaky).
6. **Still open**, grouped by category (built and waits for a deploy, waits for your answer, then one group per
   subject), each by its name and a short description, never a code alone (JSON tasks: "#<number> <title>"; a new JSON task gets `number` = highest number in all task files and done files + 1).
7. **run.json** in the run's folder: the same content, nothing only in the Markdown ("You" → `you`, no deploy →
   `notDeployed`, ruled out and other notes → `sections`, decisions made alone → `decisions`; format in
   `node_modules/nightshift-board/README.md`; skill `nightshift:plan-night-run`, part 4). A new run waits for the
   owner's "Review done" on the board, and `gate.holdUntilReviewed` deploys are refused until then.

Then:
- Tick finished roadmap items, only with evidence, by their exact names. Tasks in JSON task files: see step 5.
- Never add roadmap or task items on your own (new failures, ideas, follow-ups): list them under "Proposed items"
  in run.json (`proposed: [{ id, text }]`, ids P1, P2, … unique in the run), each a concrete task (what, where,
  done when), on the task or failed test it is about, at the top level only when it belongs to none. Leave out
  anything already shown elsewhere: a decision, a failed test, a "You" step, a "Still open" line, or an item already
  in a roadmap or task file.
- Write every line for an owner who didn't watch: plain words, a half-sentence explaining any tool or inner name
  the first time.
- No pickup memory: the summary is the pickup.
- Commit, push, open one pull request with a clear summary. Don't merge it unless the owner allowed it.
- Last: stop the keep-awake process (and whatever the project's rules add, e.g. put the computer to sleep).

When back, the owner reviews with skill `nightshift:start-review`.
