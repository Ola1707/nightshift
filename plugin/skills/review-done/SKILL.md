---
name: review-done
description: Ends review mode (the hook started by /nightshift:start-review), so code edits are allowed again. Only when the user types /nightshift:review-done.
disable-model-invocation: true
---

# Review done

1. Run `pnpm exec nightshift config` (or `npx nightshift config`) for the project's settings, and read
   `<paths.board>/project.md` if it exists. Where project.md and this skill differ, project.md wins.
2. The plugin's review-mode hook already turned review mode off when the user typed this command. Reply in one line:
   review mode is off and code edits are allowed again, plus what's changed and not committed yet from the review.
