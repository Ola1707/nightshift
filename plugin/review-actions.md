# Acting on the review's answers

On the review page the owner answers:

- each **decision made alone**: **OK**, **Revert now** or **Revert later**;
- each **way forward** on a task that isn't done (run.json `solutions`): **Do it now**, **Do it later**, or neither
  (= don't).

What is still to do waits under **Waiting for Claude** on the pick page. `GET /api/waiting` gives `ref`, `kind`
(`revert` or `solution`), `how` (`now` or `later`), `text`, `note`, the task, newest run first. It stays there
until Claude handles it and records it in `<paths.board>/handled.json`:

```json
{ "<ref>": { "how": "now", "done": "one line: what was done", "at": "<ISO time>" } }
```

Never write `qa.json` (the owner's answers); only `handled.json`.

## When

The owner says "do it now" or "revert now", or a review, or the night board's "night board ready", finds any
waiting.

## now

- A revert: undo what that decision changed, so the result is what the other way would have given (the note says
  which, if there were options).
- A solution: do it.

Smallest change, the project's usual checks. Review mode blocks code edits: ask the owner to type
`/nightshift:review-done` first, or leave it for after the review. Something only the owner may do (a setting on
their machine, a purchase): picking "Do it now" is their OK for exactly that. Don't commit without the owner's OK.
Then record it and reply in one line.

## later

Add an open task to the fitting task file: "Revert: <what the decision did>" or the solution's text, with the note
and where it came from (`ref`). Record it (`done`: the task file and title) and reply in one line. The owner picks
it on the board like any other task.
