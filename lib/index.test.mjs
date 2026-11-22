import assert from "node:assert/strict";
import { test } from "node:test";
import * as nightshift from "./index.mjs";

test("the package exports the six functions", () => {
  assert.deepEqual(Object.keys(nightshift).sort(), [
    "isBlankPicture",
    "loadConfig",
    "pictureProblems",
    "reviewGateProblem",
    "runPictures",
    "unreviewedRuns",
  ]);
  for (const fn of Object.values(nightshift)) assert.equal(typeof fn, "function");
});
