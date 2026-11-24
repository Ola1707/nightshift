---
name: update
description: Apply the updates a new Nightshift version brought, the ones the owner picks. Use when the user types /nightshift:update, says "nightshift update", or after updating the Nightshift plugin or package.
---

# Update

A new Nightshift version never changes the project by itself: it only adds updates to a list. This skill asks which
to apply.

**Rule 1:** everything you write for the owner follows `<plugin>/rule-1.md` (new information only). `<plugin>` is two
folders up from this skill's base directory.

1. Run `pnpm exec nightshift updates` (or `npx nightshift updates`). It prints the updates not answered yet as JSON:
   `id`, `title`, `what` (plain words), `changes` (files), `undo`. None: say so in one line and stop.
2. One round of questions (AskUserQuestion, multiSelect): one option per update, its `title` as the label and its
   `what` as the description. More than 4: several questions in the same round.
3. For each update the owner picked: `pnpm exec nightshift update <id>`. For each one not picked:
   `pnpm exec nightshift update <id> --skip` (it won't be asked again). Never apply an update the owner didn't pick.
4. Say in a line per applied update what changed. For `tasks-json`: show the counts it reports (tasks converted,
   prompts moved), remind that nothing is committed, and offer to commit.
