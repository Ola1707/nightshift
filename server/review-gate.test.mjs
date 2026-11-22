import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { reviewGateProblem, unreviewedRuns } from "./review-gate.mjs";

function runsFolder(runs) {
  const dir = mkdtempSync(join(tmpdir(), "review-gate-"));
  for (const [name, review] of Object.entries(runs)) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, "run.json"), "{}");
    if (review) writeFileSync(join(dir, name, "review.json"), JSON.stringify(review));
  }
  mkdirSync(join(dir, "folder-without-run-json"));
  return dir;
}

const held = ["demo", "production"];

test("lists runs with no review or an unfinished one", () => {
  const dir = runsFolder({
    "night-run-2030-01-05": null,
    "night-run-2030-01-06": { done: true },
    "night-run-2030-01-07": { done: false },
  });
  assert.deepEqual(unreviewedRuns(dir), ["night-run-2030-01-05", "night-run-2030-01-07"]);
  assert.deepEqual(unreviewedRuns(join(dir, "nothing-here")), []);
});

test("stops the held environments only, and says where to review", () => {
  const dir = runsFolder({ "night-run-2030-01-05": null });
  const problem = reviewGateProblem("demo", dir, { held });
  assert.match(problem, /No demo deploy while a run waits for its review: night-run-2030-01-05\./);
  assert.match(problem, /Review it on the board \(http:\/\/localhost:8095\/review\) and press "Review done"\./);
  assert.match(reviewGateProblem("production", dir, { held }), /night-run-2030-01-05/);
  assert.equal(reviewGateProblem("staging", dir, { held }), null);
});

test("nothing is held by default; the board address can be set", () => {
  const dir = runsFolder({ "night-run-2030-01-05": null });
  assert.equal(reviewGateProblem("production", dir), null);
  assert.match(
    reviewGateProblem("production", dir, { held: ["production"], boardUrl: "http://localhost:9000/review" }),
    /\(http:\/\/localhost:9000\/review\)/,
  );
});

test("lets a held environment through once every run is reviewed", () => {
  const dir = runsFolder({ "night-run-2030-01-05": { done: true } });
  assert.equal(reviewGateProblem("demo", dir, { held }), null);
});
