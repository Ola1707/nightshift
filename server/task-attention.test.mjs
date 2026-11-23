import assert from "node:assert/strict";
import { test } from "node:test";
import { taskAttention } from "../public/task-attention.js";

test("a done task needs no attention", () => {
  assert.equal(taskAttention({ status: "done" }), null);
  assert.equal(taskAttention({ status: "done", missing: "" }), null);
});

test("not done with a Waits text is Waiting", () => {
  for (const missing of ["Waits for 8A.2ck green on Development.", "waiting for Ola", "WAITS for x"]) {
    const a = taskAttention({ status: "not-done", missing });
    assert.equal(a.tone, "warn");
    assert.equal(a.label, "Waiting");
  }
});

test("not done is Not done", () => {
  assert.deepEqual(taskAttention({ status: "not-done", missing: "Ran out of time." }), {
    tone: "bad",
    label: "Not done",
    text: "Ran out of time.",
  });
  assert.equal(taskAttention({ status: "not-done" }).label, "Not done");
});

test("partly done is Partly done", () => {
  const a = taskAttention({ status: "partial", missing: "No Hebrew." });
  assert.equal(a.tone, "warn");
  assert.equal(a.label, "Partly done");
});

test("done with something missing is flagged", () => {
  const a = taskAttention({ status: "done", missing: "One screenshot." });
  assert.equal(a.tone, "warn");
  assert.equal(a.label, "Done, something left");
});

test("the text is the missing text", () => {
  assert.equal(taskAttention({ status: "partial", missing: "abc" }).text, "abc");
  assert.equal(taskAttention({ status: "not-done" }).text, null);
});
