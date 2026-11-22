import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { reviewSaver } from "../public/review-save.js";

// Fakes: `save` writes into an in-memory review (standing in for review.json) and resolves on a later tick.
function fakes({ confirmAnswer = true, failSaves = 0 } = {}) {
  const calls = { save: [], reload: 0, confirm: [] };
  const review = {};
  let failures = failSaves;
  const deps = {
    save: async (done) => {
      calls.save.push(done);
      await delay(5);
      if (failures > 0) {
        failures -= 1;
        throw new Error("save failed");
      }
      review.done = done;
    },
    reload: () => {
      calls.reload += 1;
    },
    confirm: (text) => {
      calls.confirm.push(text);
      return confirmAnswer;
    },
  };
  return { calls, review, deps };
}

test("a double-click on Review done saves once, and a stray reopen click asks and changes nothing", async () => {
  const { calls, review, deps } = fakes();
  const saver = reviewSaver(deps);
  const first = saver.markDone();
  const second = saver.markDone();
  await Promise.all([first, second]);
  assert.deepEqual(calls.save, [true]);
  assert.deepEqual(review, { done: true });
  assert.equal(calls.reload, 1);

  // The reloaded page shows "Reopen the review" in the same spot; the stray click is answered "no".
  const reloaded = fakes({ confirmAnswer: false });
  reloaded.review.done = true;
  await reviewSaver(reloaded.deps).reopen();
  assert.deepEqual(reloaded.calls.save, []);
  assert.deepEqual(reloaded.review, { done: true });
  assert.equal(reloaded.calls.confirm.length, 1);
});

test("reopen asks first and saves not done on yes", async () => {
  const { calls, review, deps } = fakes({ confirmAnswer: true });
  await reviewSaver(deps).reopen();
  assert.deepEqual(calls.save, [false]);
  assert.deepEqual(review, { done: false });
  assert.deepEqual(calls.confirm, [
    "Reopen the review? Deploys held for the review will wait again.",
  ]);
  assert.equal(calls.reload, 1);
});

test("Review done with unchecked QA items and a no saves nothing", async () => {
  const { calls, deps } = fakes({ confirmAnswer: false });
  await reviewSaver(deps).markDone("2 QA items are not checked. Mark the review done anyway?");
  assert.deepEqual(calls.save, []);
  assert.equal(calls.reload, 0);
});

test("after a failed save the button works again", async () => {
  const { calls, review, deps } = fakes({ failSaves: 1 });
  const saver = reviewSaver(deps);
  await assert.rejects(saver.markDone(), /save failed/);
  assert.equal(calls.reload, 0);
  await saver.markDone();
  assert.deepEqual(calls.save, [true, true]);
  assert.deepEqual(review, { done: true });
  assert.equal(calls.reload, 1);
});
