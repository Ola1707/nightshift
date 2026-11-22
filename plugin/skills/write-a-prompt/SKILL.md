---
name: write-a-prompt
description: Write a ready-to-run prompt for a task (a task-file item, a roadmap action or a bug) that splits the work across models by what each part needs — Opus for decisions, Sonnet for code, Haiku for fixed commands — and keeps small work in one agent when handing it off would cost more than doing it. Use when the user types /nightshift:write-a-prompt, says "write a prompt", "prompt for this task", "prompt for sonnet", or when /nightshift:do, the night board or a review needs a prompt and the project has no prompt skill of its own (`skills.prompt`).
---

# Write a prompt

You (the planner, usually Opus) write the prompt; you don't do the task. The prompt says what to do **and which
model does each part**, so no part runs on a bigger model than it needs.

## 1. Learn the task and the code

- Read the project's own prompt rules first: the **Prompts** section of `<paths.board>/project.md` (where prompts
  go, their format, the checks, what never goes in a prompt). They win over the defaults below.
- Read the task where it's written (its task file or roadmap section) and only the parts of the code and docs it
  touches. Find the real file paths, function names, keys and tests to name in the prompt.
- List every question the coder could ask. Answer each from the task or the code and write the answer in as a fact.
  What only the user can decide: ask before writing (AskUserQuestion, a recommended option first), **one item at a
  time**: this item's questions, let the user ask and answer back, write this item's prompt, then the next item. Decide small
  technical details yourself. No "if X, do Y or ask me" hedges.

## 2. Split the work by model

Give each part of the task to the smallest model that does it well:

| Model | Gets |
|---|---|
| **Opus** | decisions the prompt can't settle ahead of time, hard debugging, judging results (when to stop retrying) |
| **Sonnet** | writing and changing code and tests, fixing a failure that needs reading code |
| **Haiku** | fixed commands and reading their output: checks (typecheck, lint, tests) printing PASS/FAIL, watching a long run isn't stuck, moving files, screenshots |

**Split only when it saves.** Every subagent starts cold: it reads the prompt, the files and the project rules
again. Hand a part to a smaller model only when that part is big enough to pay for that start-up, e.g. a test suite
that runs for minutes, many files to rename, a long log to scan. One short command, or a step that needs what the
agent already knows, stays with the agent that is already working, even if a smaller model could run it.

Default shape, cut down to what the task needs:

1. **Sonnet** codes the change (and the tests the change needs or breaks).
2. **Haiku** runs the checks and reports PASS/FAIL per check, reading a log only on a failure. Skip this split for a
   task whose checks take seconds: Sonnet runs them at the end.
3. A failure goes back to **Sonnet** with the failing output; **Opus** only decides when to stop retrying.

A task that is only a few lines or one command: one agent, no split, and say so in the prompt.

## 3. Write it

- Under the task in its task file, or in the project's prompt file if it has one. A heading with the task's name,
  then the prompt in a ```text block:
  - What to build: files, names, behavior, edge cases, user-facing texts, the tests to write.
  - **Who does what:** one line per part, `Sonnet: ...`, `Haiku: ...` (as in section 2). Nothing else for one agent.
  - The project's tests the change breaks: search them for the changed ids, texts, routes and flows, and fix them in
    the same change.
  - Out of scope: the nearby tasks, named, so they aren't started.
  - "Everything is decided in this prompt; don't ask about choices. Stop only if the code contradicts it."
  - End: the checks to run, don't commit, final message = changed files and follow-ups only.
- Flip the task's line from `- [ ]` to `+ [ ]` (it has a prompt now).
- Don't show the prompt in chat. End with one line: where it was saved and the model split in a few words
  (e.g. "Sonnet codes, Haiku runs the suites" or "one agent, too small to split").
