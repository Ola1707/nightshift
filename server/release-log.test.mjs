import assert from "node:assert/strict";
import { test } from "node:test";
import { writeReview } from "./release-log.mjs";

const log = `# Release: staging, 2030-01-04 12:58

## Changes

### Features

| Item | Change                          | App      | Unit | QA  |
| ---- | ------------------------------- | -------- | ---- | --- |
| –    | Website: opening hours (T.1)    | website  | –    | ☐   |
| –    | Order form: pick a day (T.2)    | Shop     | –    | ☐   |
| –    | Something else (T.12)           | Shop     | –    | ☐   |

### Bugs

| Item | Change                        | App      | Unit | QA  |
| ---- | ----------------------------- | -------- | ---- | --- |
| –    | Fix B.2: cart total preview   | Shop     | –    | ☐   |

## Plan

| Part | Planned |
| ---- | ------- |
| api  | yes     |
`;

const run = {
  title: "Night run 2030-01-04",
  tasks: [
    { id: "T.1", title: "Website: opening hours", qa: "Website" },
    { id: "T.2", title: "Order form: pick a day", qa: "Shop" },
    { id: "B.2", title: "Cart total", qa: "Shop" },
    { id: "staging-release", title: "Staging release", qa: null },
  ],
};
const qa = {
  "T.1": { checked: true, note: "" },
  "B.2": { checked: false, note: "still clipped on the tablet" },
};

test("QA ticks fill the release log's QA column, matching whole codes only", () => {
  const out = writeReview(log, run, qa, "2030-01-05T08:30:00.000Z");
  assert.match(out, /Website: opening hours \(T\.1\)\s*\| website\s*\| –\s*\| ☑ \|/);
  assert.match(out, /Order form: pick a day \(T\.2\)\s*\| Shop\s*\| –\s*\| ☐ \|/);
  assert.match(out, /Something else \(T\.12\)\s*\| Shop\s*\| –\s*\| ☐\s*\|/);
  assert.match(out, /Fix B\.2: cart total preview\s*\| Shop\s*\| –\s*\| ✗ \|/);
  assert.match(out, /\| api {2}\| yes {5}\|/);
});

test("the Review section lists every QA task and is replaced when the review is done again", () => {
  const once = writeReview(log, run, qa, "2030-01-05T08:30:00.000Z");
  assert.match(
    once,
    /## Review\n\nReviewed on the AI board, done 2030-01-05 08:30 \(Night run 2030-01-04\): 1 of 3/,
  );
  assert.match(once, /\| B\.2 \| Cart total \| ✗ \| still clipped on the tablet \|/);
  assert.doesNotMatch(once, /staging-release/);
  const twice = writeReview(
    once,
    run,
    { ...qa, "T.2": { checked: true, note: "" } },
    "2030-01-06T09:00:00.000Z",
  );
  assert.equal(twice.match(/## Review/g).length, 1);
  assert.match(twice, /done 2030-01-06 09:00 .*: 2 of 3/);
});

test("the Review section lists decisions and fixed-test notes", () => {
  const withDecisions = {
    ...run,
    decisions: [{ id: "run-1", text: "Deployed to staging only." }],
    tasks: [
      ...run.tasks,
      {
        id: "T.3",
        title: "Order form",
        qa: null,
        decisions: [
          { id: "T.3-1", text: "Test viewport 390×844." },
          { id: "T.3-2", text: "Shadow only on web." },
        ],
      },
    ],
    failures: [
      { test: "web home-footer.spec.ts 1", fixedIn: "test" },
      { test: "web checkout.spec.ts 12", fixedIn: "app" },
      { test: "android menu.spec.ts 3", fixedIn: "not fixed" },
    ],
  };
  const out = writeReview(
    log,
    withDecisions,
    {
      ...qa,
      "decision:T.3-1": { checked: true, note: "" },
      "decision:T.3-2": { checked: false, note: "Why not on phones?" },
      "failure:web home-footer.spec.ts 1": { checked: false, note: "Make it wait for fonts" },
      "failure:android menu.spec.ts 3": { checked: false, note: "not a fixed one" },
    },
    "2030-01-06T08:30:00.000Z",
  );
  const review = out.slice(out.indexOf("## Review"));
  assert.match(review, /Decisions: 1 of 3 ticked/);
  assert.match(review, /\| Test viewport 390×844\. \| T\.3 \| ✓ \| {2}\|/);
  assert.match(review, /\| Shadow only on web\. \| T\.3 \| open \| Why not on phones\? \|/);
  assert.match(review, /\| Deployed to staging only\. \| run \| open \| {2}\|/);
  assert.match(review, /\| web home-footer\.spec\.ts 1 \| test \| Make it wait for fonts \|/);
  assert.doesNotMatch(review, /checkout/);
  assert.doesNotMatch(review, /not a fixed one/);
});

test("the Review section lists proposed items the owner ticked or wrote on, by id or by number", () => {
  const out = writeReview(
    log,
    {
      ...run,
      proposed: [
        { id: "P1", text: "Fix the image cleanup." },
        { id: "P2", text: "Pick one retry delay." },
        { id: "P3", text: "Delete the old DNS records." },
      ],
    },
    {
      "proposed:P1": { checked: true, note: "" },
      "proposed:P2": { checked: false, note: "Use 10 s" },
    },
    "2030-01-07T16:00:00.000Z",
  );
  const review = out.slice(out.indexOf("## Review"));
  assert.match(review, /\| Fix the image cleanup\. \| ☑ yes \| {2}\|/);
  assert.match(review, /\| Pick one retry delay\. \| ☐ no \| Use 10 s \|/);
  assert.doesNotMatch(review, /DNS records/);

  const older = writeReview(log, { ...run, proposed: ["A plain string item."] }, { "proposed:1": { checked: true, note: "" } }, "2030-01-07T16:00:00.000Z");
  assert.match(older, /\| A plain string item\. \| ☑ yes \|/);
});

test("proposed items on a task or a failed test count too, with the run's own", () => {
  const out = writeReview(
    log,
    {
      ...run,
      tasks: [{ ...run.tasks[0], proposed: [{ id: "P1", text: "Raise the memory limit." }] }, ...run.tasks.slice(1)],
      failures: [{ test: "android setup 8", fixedIn: "flaky", proposed: [{ id: "P2", text: "Find the leak." }] }],
      proposed: [{ id: "P3", text: "Delete the old DNS records." }],
    },
    {
      "proposed:P1": { checked: true, note: "" },
      "proposed:P2": { checked: false, note: "Ask me first" },
      "proposed:P3": { checked: true, note: "" },
    },
    "2030-01-07T16:00:00.000Z",
  );
  const review = out.slice(out.indexOf("## Review"));
  assert.match(review, /\| Raise the memory limit\. \| ☑ yes \|/);
  assert.match(review, /\| Find the leak\. \| ☐ no \| Ask me first \|/);
  assert.match(review, /\| Delete the old DNS records\. \| ☑ yes \|/);
});

test("a decision changed to another option shows the picked option", () => {
  const out = writeReview(
    log,
    {
      ...run,
      decisions: [{ id: "run-1", text: "Deployed to staging only.", options: ["Staging only", "Staging and demo"] }],
    },
    { "decision:run-1": { checked: true, choice: 1, note: "" } },
    "2030-01-07T16:00:00.000Z",
  );
  assert.match(out, /\| Deployed to staging only\. \| run \| → Staging and demo \|/);
});
