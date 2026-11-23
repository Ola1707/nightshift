---
name: doctor
description: Checks that the Nightshift board still fits the project (settings, folders, task files, runs, flow, port, test-suite screenshots), explains each problem in one line and offers the fix. Use when the user types /nightshift:doctor, says the board or the night run "doesn't work", or after the project's test flow changes (a new or renamed suite, test tool, report folder, device or screenshot command).
---

# Doctor

1. Run `pnpm exec nightshift doctor --shots` (or `npx nightshift doctor --shots`). It prints one line per check:
   `OK ...` or `PROBLEM: ...`, and exits 1 when there is a problem. `--shots` runs each suite's
   `screenshot.command` and checks the picture is not blank; a suite whose screenshots are taken by its test runner
   shows as skipped.
   Also run `pnpm exec nightshift rules --plugin <plugin>` (`<plugin>` is two folders up from this skill's base
   directory): each `CHANGED` line is a problem too, fixed by going through that file
   (`<plugin>/project-rules.md`, "After the plugin changed").
2. No problem: say so in one line.
3. For each `PROBLEM:` line, one plain line: what is wrong and the fix, for example:
   - a missing path or task file: create it, or fix the key in `board.config.json`;
   - a `run.json` that doesn't parse or points to a missing picture: fix the file or the path;
   - the port used by something else: stop it, or set `port` in `board.config.json`;
   - a screenshot command that fails, prints nothing or gives a blank picture: wake the device or app, or fix
     `screenshot.command` (it prints a PNG, or writes the path given as `{file}`).
4. Offer to make the fixes (one AskUserQuestion: fix all / pick / leave them). Make the chosen ones, then run the
   doctor again and report the new result in one line.
5. When the test flow itself changed (a suite added, removed or renamed, a new rerun command, report folder or
   device), propose the change to `suites` in `board.config.json`, make it after the user's yes, and run the doctor
   again. For a bigger change, offer `/nightshift:setup`.
