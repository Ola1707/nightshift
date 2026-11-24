import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { failureAttempts, stepsLink } from "../public/failure-report.js";
import { pictureProblems, reportProblems, runPictures } from "./run-pictures.mjs";

test("failure card links its steps page", () => {
  const f = {
    test: "web a.spec.ts 1",
    report: "tests/e2e/runs/x-web-local/failures.html#opens-the-card",
  };
  assert.deepEqual(stepsLink(f, {}), { href: f.report, text: "Steps" });
});

test("failure card says the page is gone when the runs folder was cleaned", () => {
  const f = {
    report: "tests/e2e/runs/x-web-local/failures.html#opens-the-card",
  };
  const missing = { "tests/e2e/runs/x-web-local/failures.html": "missing" };
  assert.deepEqual(stepsLink(f, missing), {
    gone: true,
    text: "page no longer on this computer",
  });
});

test("failure card of an old run.json has no steps link", () => {
  assert.equal(stepsLink({ test: "old" }, {}), null);
});

test("reportProblems lists the failures.html files that are gone", () => {
  const repo = mkdtempSync(join(tmpdir(), "reports-"));
  try {
    mkdirSync(join(repo, "tests/e2e/runs/here"), { recursive: true });
    writeFileSync(join(repo, "tests/e2e/runs/here/failures.html"), "<html></html>");
    const run = {
      testRuns: [{ report: "tests/e2e/runs/gone/failures.html" }, { report: null }],
      failures: [
        { report: "tests/e2e/runs/here/failures.html#a" },
        { report: "tests/e2e/runs/gone/failures.html#b" },
        { report: "tests/e2e/runs/old/report/index.html" },
      ],
    };
    assert.deepEqual(reportProblems(run, repo), {
      "tests/e2e/runs/gone/failures.html": "missing",
      "tests/e2e/runs/old/report/index.html": "missing",
    });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("failureAttempts reads attempts, in order", () => {
  const attempts = [
    { label: "run 1 (02:14)", screenshot: "a.png", failedStep: "Tap Pay" },
    { label: "run 2 (02:20)", screenshot: "b.png" },
  ];
  assert.deepEqual(failureAttempts({ test: "t", attempts }), attempts);
});

test("failureAttempts counts an old single screenshot as one attempt", () => {
  assert.deepEqual(failureAttempts({ test: "t", screenshot: "a.png" }), [{ screenshot: "a.png" }]);
  assert.deepEqual(failureAttempts({ test: "t" }), []);
});

test("runPictures lists every attempt's screenshot and pictureProblems checks each", async () => {
  const repo = mkdtempSync(join(tmpdir(), "attempts-"));
  try {
    writeFileSync(join(repo, "gone-check.txt"), "");
    const run = {
      failures: [
        {
          test: "four",
          attempts: [1, 2, 3, 4].map((n) => ({
            label: `run ${n}`,
            screenshot: `f/${n}.png`,
          })),
        },
        { test: "old", screenshot: "f/old.png" },
      ],
    };
    assert.deepEqual(
      runPictures(run).map((p) => p.path),
      ["f/1.png", "f/2.png", "f/3.png", "f/4.png", "f/old.png"],
    );
    assert.deepEqual(await pictureProblems(run, repo), {
      "f/1.png": "missing",
      "f/2.png": "missing",
      "f/3.png": "missing",
      "f/4.png": "missing",
      "f/old.png": "missing",
    });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
