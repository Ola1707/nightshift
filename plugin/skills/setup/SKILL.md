---
name: setup
description: Fits the Nightshift board and skills to this project in about ten minutes - detects its test flow, asks one round of questions, writes the settings, has the user approve the Flow and Checklist pages, then checks it all. Only when the user types /nightshift:setup.
disable-model-invocation: true
---

# Setup

The goal: after about ten minutes the board and the skills fit this project's own test flow, and the user has seen
and approved how the work will go. Do the steps in order. Detect what you can; ask only what detection can't settle.

Below, `nightshift <command>` means the project's package manager form: `pnpm exec nightshift <command>`,
`npx nightshift <command>` or `yarn nightshift <command>` (pick by the lock file: `pnpm-lock.yaml`,
`package-lock.json`, `yarn.lock`).

## a. The package

Run `nightshift config`. If it prints the settings as JSON, the package is installed; go on. If the command is not
found, give the one install command for their package manager and wait for the user to run it (or to say you may):

- pnpm: `pnpm add -D github:<owner>/nightshift`
- npm: `npm install -D github:<owner>/nightshift`
- yarn: `yarn add -D nightshift-board@github:<owner>/nightshift`

(`<owner>/nightshift` is the GitHub repo the plugin was installed from; `/plugin` shows it under Marketplaces.)

If `board.config.json` already exists, say so and ask whether to start over (`init --force` later) or stop and run
`/nightshift:doctor` instead.

## b. Detect, without asking

Read files only; don't run the tests. Note what each finding settles.

- **Test scripts:** the `scripts` of every `package.json` (root and, in a monorepo, each app and package): names like
  `test`, `test:*`, `e2e`, `vitest`, `jest`, `playwright`, `cypress`, `maestro`, `detox`.
- **Test tools:** config files for Playwright (`playwright.config.*`), Cypress (`cypress.config.*`), Vitest
  (`vitest.config.*`, `vitest.workspace.*`, a `test` key in `vite.config.*`), Jest (`jest.config.*`, a `jest` key in
  package.json), Maestro (`.maestro/`, `maestro/`, `*.yaml` flows), Detox (`.detoxrc*`, `detox.config.*`). From
  each config, read where reports and failure screenshots land (Playwright `outputDir` and reporters, Cypress
  `screenshotsFolder`, and so on) and any viewport.
- **CI:** `.github/workflows/*.yml`, `.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`: which suites
  run, in which order, and how they rerun failures (`--last-failed`, `--only-failures`, retries, sharding).
- **Tasks and docs:** an existing `docs/` folder, a roadmap (`roadmap*.md`), `TODO.md`, `CHANGELOG.md`, a release or
  run log folder.
- **Monorepo:** `pnpm-workspace.yaml`, `workspaces` in package.json, `turbo.json`, `nx.json`; the apps under
  `apps/` and packages under `packages/` (the `apps` setting).
- **Owner:** `git config user.name` (offer it as the recommended name; the user may prefer another).
- **Free port:** the default board port is 8095; if something already listens there, suggest the next free one.

## c. One round of questions

One AskUserQuestion call: at most four questions, short, the recommended option first (from detection), and only
what detection could not settle. Pick from these, in this order of importance; fold a settled one into the
recommended option of a related question ("Detected: Vitest, then Playwright"):

1. **Suites and order:** which test suites the board and the runs use, and in what order.
2. **Rerun failed only:** how to rerun only the failed tests of each suite (for example
   `npx playwright test --last-failed`, `npx vitest run --changed`, `file:line` per test).
3. **Reports and failure screenshots:** where each suite's report and failure screenshots land.
4. **Screenshots per platform:** how to take one: a browser viewport (`390x844`, `1280x800`), or a command that
   prints a PNG or writes `{file}` (`adb exec-out screencap -p`, `xcrun simctl io booted screenshot {file}`).
5. **Held environments:** which deploy environments wait while a run waits for its review (often `production`).
6. **Where tasks and run summaries live:** the default `docs/roadmap`, `docs/roadmap/night-run`, `docs/release-log`,
   or the folders found in step b.
7. **The owner's name** the board shows.

Whatever is not asked takes the detected or default value; say which in one line after the answers.

## d. Write the settings

1. Write the answers as a JSON object of settings keys (the README's "Settings" table) to a file outside the project,
   for example in the system temp folder. Only keys that differ from the defaults. A suite looks like:

   ```json
   {
     "id": "e2e",
     "label": "E2E (Playwright)",
     "run": "npx playwright test",
     "rerunFailed": "npx playwright test --last-failed",
     "report": "playwright-report/index.html",
     "failureShot": "test-results/**/test-failed-*.png",
     "screenshot": { "how": "playwright", "viewport": "390x844" }
   }
   ```

   A device suite takes `"screenshot": { "command": "<prints a PNG, or writes {file}>" }`. Add every folder the board
   must show pictures or reports from to `paths.served` (it serves only those).
2. Run `nightshift init --answers <that file>`. It writes `board.config.json`, the task files, the runs folder and
   `<paths.board>/flow.json` and `plan-checklist.json`, and never overwrites a file that exists. If it refuses an
   answer, fix the file and run it again.
3. Write a starter `<paths.board>/project.md`: the project's own rules that came up in steps b and c, grouped by
   skill (`## All skills`, `## night-board`, `## do`, `## start-review`). The skills read it first; where it and
   a skill differ, it wins. Keep it to what really came up; it can grow later.

## e. Show how the work will go

1. Start the board in the background: `nightshift serve` (port from `nightshift config`; if it already answers there,
   it is running).
2. Give the Flow page link, `http://localhost:<port>/flow`: "This is the suggested way to work. Approve each type, or
   tell me what to change." Change `<paths.board>/flow.json` as they ask (a type with the same id replaces the
   default, a new id adds one, `null` hides one; `intro`, `always` and `eachDay` replace the default; `roles`
   merge), then ask them to approve the changed type on the page. An approval stops counting when its type changes.
3. Then the Checklist page link, `http://localhost:<port>/checklist`: "Tick what you approve and what Claude does
   alone." The page saves `<paths.board>/plan-checklist.json` itself; don't edit it.

## f. Check it

1. Run `nightshift doctor --shots`. It prints one `OK` or `PROBLEM:` line per check; each problem names its fix.
2. Go through the problems with the user: explain each in one plain line and make the fix after their yes (a missing
   folder, a wrong path in `board.config.json`, a screenshot command that prints nothing, a device that is asleep).
   Run the doctor again until it prints no problem, or the user leaves one for later.
3. End with the three things they will use, one line each:
   - "night board": opens the board to pick tonight's tasks;
   - "night board ready": the picks are saved, Claude prepares the run;
   - `/nightshift:do`: starts a new piece of work by its type's steps.
