---
name: review-long-task
description: Help the user review a finished long task (a day run, night run, release, or any unattended run) line by line, from its summary in the runs folder or the task and roadmap files. Use whenever the user says they are reviewing a run or a long task, quotes or selects lines from a run summary, or comes with questions, remarks and small fixes about what a run did — even if they don't say "review".
---

# Review a long task

## 0. The project's settings first

1. Run `pnpm exec nightshift config` (or `npx nightshift config`) for the project's settings: `port`, `paths`
   (`runs`, `tasks`, `roadmaps`, `board`), `skills`.
2. Read `<paths.board>/project.md` if it exists: the project's own rules, grouped by skill. Where project.md and this
   skill differ, project.md wins.

The user reads the summary of a long task (for example `<runs folder>/day-run-<date>.md`) and comes back with
questions, remarks and small fixes, often several in one message, often about a quoted or selected line. Work
through each point in turn.

**Review mode:** `/nightshift:review-long-task` turns on the plugin's review-mode hook: docs and Markdown files can
change, code cannot, until the user types `/nightshift:review-done`.

## Start

When the user says they're starting a review, answer in one short line that you're ready. Don't read files or
summarize the run before the first point comes in. When the run has a `run.json`, the line carries the board link
`http://localhost:<port>/review` (start the board first, skill `night-board`); the user's QA ticks and problem notes
are in `qa.json` next to it, and each note is a point like the ones below. Read `qa.json` of every run being
reviewed (also older runs not yet "Review done") whenever the user says the review is done or comes back after using
the board, and work through every note right away; never end the review with a note unhandled.

## Each point in the message

Sort each point into one of these and handle it:

1. **A question (info):** answer it, from evidence. Look it up in the commits (`git log`, `git show --stat <sha>`),
   the code, the task files and the roadmaps, then give the facts: what the limits or numbers are, which test it
   was, what type of test, whether it failed before the fix and passed after. Quote real numbers and file links,
   never guesses. Point out anything the summary glossed over (for example: "the test passes with and without the
   fix, so it doesn't catch the bug").
2. **A task or wish** (including small UI or code fixes): add it to the roadmap right away, without asking. Don't
   change the code itself, even when the fix looks tiny, unless the user says to do it now.
   - Put it in the section where it belongs (the phase or the task file it's about), next to related items.
   - Make it concrete: real numbers, file names, environments, and what "done" looks like. If the user asked for
     numbers or details to be written in, write them in (a table is fine).
   - Write a prompt for it (the project's prompt skill, `skills.prompt`; without one, `/nightshift:write-a-prompt`) only if the rest of that phase already has prompts, or if it's a bug. If the phase isn't planned yet,
     don't write a prompt and don't ask about one.
   - If you shape the user's idea differently (a safer variant, for example), write your version and say in one
     line what you changed and why.
3. **A fact about a bug** (where else it happens, for example "it also fails on phones"): add it to that bug's entry
   in the bug task file (`bug.md` in the tasks folder), including the next step it implies.
4. **A product decision that's really the user's:** ask it with AskUserQuestion, in short, plain questions. Decide
   technical details yourself.
5. **A sentence that's cut off or unclear:** say where it stopped and ask what they meant. Don't guess.

## Proposed items

When the review reaches the summary's "Proposed items", ask about them with AskUserQuestion: one question per item,
"Open a task?" with Yes / No, up to 4 per round. Yes → add it as a task (point 2 above); No → leave it out. Skip
items the user already handled in the review.

## Rules

- Don't commit unless the user asks. At the end of each reply, say what's changed and not committed yet.
- Use the roadmap's exact item names; no new names.
- A new lasting rule from the review goes into the skill or doc it's about; a rule about how this project uses the
  board goes into `<paths.board>/project.md`. Memory only for a personal preference written nowhere else.
- Items or decisions still open when the user presses "Review done": list them under "Carried to the next review"
  in that run's summary and raise them at the start of the next review.
