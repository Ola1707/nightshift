---
name: review-done
description: Ends review mode (the hook started by /nightshift:start-review), so code edits are allowed again. Only when the user types /nightshift:review-done.
disable-model-invocation: true
---

# Review done

1. Run `pnpm exec nightshift config` (or `npx nightshift config`) for the project's settings, then
   the project's own rules: run `pnpm exec nightshift rules review-done --plugin <plugin>` (`<plugin>` is two folders
   up from this skill's base directory) and follow `<plugin>/project-rules.md`: read each `OK` file (it adds to this
   skill and wins where they differ); a `CHANGED` file is gone through first.
2. The plugin's review-mode hook already turned review mode off when the user typed this command. Reply in one line:
   review mode is off and code edits are allowed again, plus what's changed and not committed yet from the review.
