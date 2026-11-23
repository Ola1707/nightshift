import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { allDecisions, openDecisions, openDecisionsOfRuns, revertsOfRuns } from "./decisions.mjs";

const run = {
  title: "Night run 2030-01-06",
  decisions: [{ id: "run-1", text: "Deployed to staging only." }],
  tasks: [
    {
      id: "T.3",
      title: "Order form",
      decisions: [
        { id: "T.3-1", text: "Test viewport 390×844." },
        { id: "T.3-2", text: "Shadow only on web." },
      ],
    },
    { id: "T.1", title: "Website wording" },
  ],
};

test("counts every task and run decision that is not ticked", () => {
  assert.deepEqual(
    allDecisions(run).map((d) => [d.id, d.taskId]),
    [
      ["T.3-1", "T.3"],
      ["T.3-2", "T.3"],
      ["run-1", null],
    ],
  );
  assert.equal(openDecisions(run, {}).length, 3);
  const qa = {
    "decision:T.3-1": { checked: true, note: "" },
    "decision:run-1": { checked: false, note: "" },
  };
  assert.deepEqual(
    openDecisions(run, qa).map((d) => d.id),
    ["T.3-2", "run-1"],
  );
});

test("a note without a tick leaves the decision open", () => {
  const qa = { "decision:T.3-2": { checked: false, note: "Why not on phones?" } };
  assert.ok(openDecisions(run, qa).some((d) => d.id === "T.3-2"));
});

test("a run without decisions has none open", () => {
  assert.deepEqual(
    openDecisions({ title: "Old run", tasks: [{ id: "T.2", title: "x" }] }, {}),
    [],
  );
  assert.deepEqual(openDecisions({}, {}), []);
});

test("the pick page lists open decisions of every run", () => {
  const dir = mkdtempSync(join(tmpdir(), "decisions-"));
  try {
    const write = (name, file, data) => {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(join(dir, name, file), JSON.stringify(data));
    };
    write("night-run-2030-01-05", "run.json", {
      tasks: [
        { id: "B.2", title: "Flaky list", decisions: [{ id: "B.2-1", text: "Six rows." }] },
      ],
    });
    write("night-run-2030-01-06", "run.json", run);
    write("night-run-2030-01-06", "qa.json", {
      "decision:T.3-1": { checked: true, note: "" },
      "decision:run-1": { checked: false, note: "Fine, but tell me first" },
    });
    write("night-run-2030-01-04", "qa.json", {}); // no run.json: not a run the board shows
    assert.deepEqual(openDecisionsOfRuns(dir), [
      {
        run: "night-run-2030-01-06",
        taskId: "T.3",
        taskTitle: "Order form",
        id: "T.3-2",
        text: "Shadow only on web.",
        note: "",
      },
      {
        run: "night-run-2030-01-06",
        taskId: null,
        taskTitle: null,
        id: "run-1",
        text: "Deployed to staging only.",
        note: "Fine, but tell me first",
      },
      {
        run: "night-run-2030-01-05",
        taskId: "B.2",
        taskTitle: "Flaky list",
        id: "B.2-1",
        text: "Six rows.",
        note: "",
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a revert answers a decision; it stays under To revert until reverts.json records it", () => {
  const qa = {
    "decision:T.3-1": { checked: false, revert: "now", note: "too slow" },
    "decision:T.3-2": { checked: false, revert: "task", note: "" },
    "decision:run-1": { checked: true, note: "" },
  };
  assert.deepEqual(openDecisions(run, qa), []);
  assert.equal(openDecisions(run, { "decision:T.3-1": { checked: false, revert: "later" } }).length, 3, "only now or task");

  const dir = mkdtempSync(join(tmpdir(), "nightshift-reverts-"));
  try {
    mkdirSync(join(dir, "night-run-2030-01-06"));
    writeFileSync(join(dir, "night-run-2030-01-06", "run.json"), JSON.stringify(run));
    writeFileSync(join(dir, "night-run-2030-01-06", "qa.json"), JSON.stringify(qa));
    const file = join(dir, "reverts.json");
    assert.deepEqual(
      revertsOfRuns(dir, file).map((d) => [d.ref, d.how, d.note]),
      [
        ["night-run-2030-01-06/T.3-1", "now", "too slow"],
        ["night-run-2030-01-06/T.3-2", "task", ""],
      ],
    );
    writeFileSync(file, JSON.stringify({ "night-run-2030-01-06/T.3-1": { how: "now", done: "abc123" } }));
    assert.deepEqual(revertsOfRuns(dir, file).map((d) => d.ref), ["night-run-2030-01-06/T.3-2"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
