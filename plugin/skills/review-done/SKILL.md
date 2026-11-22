---
name: review-done
description: Ends a review: works through every remark and question the user left in the review (the board's notes in qa.json and the points raised in the chat), then ends review mode so code edits are allowed again. Only when the user types /nightshift:review-done.
disable-model-invocation: true
---

# Review done

The one step that closes a review. The plugin's review-mode hook already turned review mode off when the user typed
this command.

1. Run `pnpm exec nightshift config` (or `npx nightshift config`) for the project's settings, and read
   `<paths.board>/project.md` if it exists. Where project.md and this skill differ, project.md wins.
2. **Go over everything the review left.** Read `qa.json` of every run being reviewed and of older runs still
   without "Review done" (`unreviewedRuns` from the package `nightshift-board`): every note (on a QA task, a task, a
   `decision:<id>`, a `failure:<test>`, a `proposed:<id>`) and every ticked `proposed:<id>`. Add the points from
   this chat's review that weren't handled yet. Handle each one by the rules of skill `start-review` ("Each point in
   the message", "Proposed items"): answer questions from evidence, add tasks and bugs to the roadmap or task file,
   ask the user's decisions in one GUI round. Never tick a decision and never write `qa.json` or `review.json`.
3. Anything still open after that goes under "Carried to the next review" in that run's summary.
4. Reply with a short list: each remark or question, one line on how it was handled. Then one line: review mode is
   off, code edits are allowed again, and what's changed and not committed yet. If a run has no `review.json` yet,
   add the board link `http://localhost:<port>/review` and ask the user to press **Review done** there (it holds the
   deploys).
