# Reverting a decision

On the review page and the pick page, each decision made alone gets one answer: **OK**, **Revert now** or **Revert
as task**. The reverts wait under **To revert** on the pick page (`GET /api/reverts`: `ref`, `how`, `text`, `note`,
newest run first) until Claude handles them and records each in `<paths.board>/reverts.json`:

```json
{ "<run>/<decision id>": { "how": "now", "done": "one line: what was undone", "at": "<ISO time>" } }
```

Never write `qa.json` (the owner's answers); only `reverts.json`.

## When

- The owner says "revert now", or the review or the night board's "night board ready" finds any under To revert.

## Revert now

For each `now`: undo what that decision changed, so the result is what the decision's other way would have given
(the owner's note says which, if there were options). Smallest change, the project's usual checks. Review mode
blocks code edits: ask the owner to type `/nightshift:review-done` first, or leave it for after the review. Don't
commit without the owner's OK. Then record it (`done`: what was undone, in a line) and reply in one line.

## Revert as task

For each `task`: add an open task to the fitting task file, titled "Revert: <what the decision did>", with what to
undo, the owner's note, and where it came from (`<run>/<decision id>`). Then record it (`done`: the task file and
title) and reply in one line. The owner picks it on the board like any other task.
