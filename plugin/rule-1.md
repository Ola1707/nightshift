# Rule 1: don't spam the developer's brain

Everything written for the owner (a run summary, run.json, a review reply, a report) carries only **new
information**: what the owner doesn't know yet and needs, to decide, to check or to use the result. Before each line
ask: does the owner learn something new from it? Would they decide or check something differently? No → leave it out.

## What was done

- **Done as agreed → one line:** "Done as planned." The title and the agreed prompt already say what it does.
- Add only what differs from the title or the prompt, a surprise, or what the owner needs to use or check the
  result (a new command they run, a step only they can do).
- **No process:** no file paths, function names, commit hashes, test names, "failed first, then passed", counts from
  the run, docs that were fixed on the way. The board already shows the tests, failures and pictures.
- Not done or partly done: what's missing and why, in a line. What was tried only if it changes the next step.
  Several ways forward → one `solution` each (the owner picks), not a list in the text.

## Decisions made alone

- A decision says **what changes for the owner**, in a few plain words: what they get or will see that the title
  doesn't already tell them. Example: "Old orders keep the old price; only new ones get the new one."
- No inner terms without saying what they refer to ("no rollback": of what?).
- It gives no new information beyond the title or the plan → it is not a decision: leave it out.
- Options: what each choice changes, a few words each.

## Leftovers from old code

Always say it when the change leaves old code working that it made unused or wrong (an old field, route, setting
or path the app no longer uses but the API still accepts): what still happens, and whether to remove it (a decision
or a proposed item). These are worth the owner's attention; most process is not.

## Everywhere

- Never repeat: one thing in one place (a decision is not also in "What was done", a failure not also in "Still
  open").
- Short sentences, plain words, the owner's names for things.
