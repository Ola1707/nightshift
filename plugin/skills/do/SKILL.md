---
name: do
description: Starts the project's "how we work" flow (the board's Flow page) for a new piece of work. First asks which type of change it is, then follows that type's steps. Only when the user types /do or /nightshift:do.
disable-model-invocation: true
---

# Do

## 0. The project's settings first

1. Run `pnpm exec nightshift config` (or `npx nightshift config`) for the project's settings: `port`, `paths`
   (`tasks`, `board`, `roadmaps`), `taskFiles`, `suites`, `skills`.
2. Read `<paths.board>/project.md` if it exists: the project's own rules, grouped by skill. Where project.md and this
   skill differ, project.md wins.
3. Run `pnpm exec nightshift flow` (or `npx nightshift flow`): the flow of work as JSON. Each type has an `id`, a
   `title`, an `example`, `steps` (`who` + `text`, `who` is a key of `roles`) and `approved`. `always` holds the rules
   for every type. `pnpm exec nightshift flow <id>` prints one type.

## 1. Ask the type first

Before anything else, ask with AskUserQuestion (short options): which type of change it is. The options are the
flow's types that describe a change (not `night-run` or `review`), each labelled with its own `title` and its
`example` as the description. With more than four, offer the first three and a fourth that groups the rest, then ask
a second question among those.

In the same AskUserQuestion call, also ask:

- **For now?** Yes, now / Later (later = write it in its task file in the tasks folder; it's offered on the next
  night run).
- **What should I do?** Action item only (write it in the task or roadmap file) / Action item + prompt / The whole
  task (follow all its steps).

Follow the type's steps only up to the chosen point, then stop.

If the user already described the work in the `/do` message, use it as the description; still ask the type, and
recommend one first.

## 2. Check the type is approved

If the chosen type has `approved: false`, reply with the Flow page link, `http://localhost:<port>/flow` (start the
board with `pnpm exec nightshift serve` if it isn't running), say that type isn't approved yet, and wait. Don't
start the work until the user has approved it there.

## 3. Follow the steps

Follow the type's `steps` in order. Stop after each step whose `who` is `human` and wait for the user's answer.

- **Where it is written:** the task file in `taskFiles` whose `file` is `<type id>.md`, in the tasks folder, from the
  start. A file marked `planOnly`: plan only, never done unattended.
- **Prompt:** with the project's prompt skill (`skills.prompt`), use it. Without one, write the prompt yourself under
  the task in its task file: what to change, which files, how "done" is checked. The prompt is written before any
  code.
- **Plan** (a type whose steps include a plan): build it from `pnpm exec nightshift checklist`. The `approve` items
  go into the plan as a short yes/no block for the user; the `claude` items are done in the plan without asking; the
  `both` items are done and also get a yes/no line.
- **Tests:** run each suite in `suites`, in order, with its `run` command; rerun the failures as its `rerunFailed`
  says; take screenshots with its `screenshot` setting. With the project's tests skill (`skills.tests`), use it.
- **Tests the change breaks (every type, part of the coding step):** go over the project's tests that touch what
  changed: search them for the changed ids, texts, routes, API fields and flows. If one would fail because of the
  change, fix that test in the same change, and say which tests changed and why. A prompt written for the work
  includes this step.
- Follow the flow's `always` rules on every type.

## Rules

- Every open item in the tasks folder is offered on each night run (the board's pick page and the `nextRunFile`).
- Releases and deploys are not part of this flow.

End every run of this skill with one line: "Flow wrong for you? Say 'change the flow'."

When the user says "change the flow": propose the edit to `<paths.board>/flow.json` (a type there replaces the
default with the same id, a new id adds one, `null` hides one; `intro`, `always` and `eachDay` replace the default;
`roles` merge), make it after their yes, and send the Flow page link (`http://localhost:<port>/flow`) to approve it.
