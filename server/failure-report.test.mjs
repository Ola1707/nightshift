import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { failureParts, stepsLink } from "../public/failure-report.js";
import { reportProblems } from "./run-pictures.mjs";

test("failure card links its steps page", () => {
  const f = {
    test: "web a.spec.ts 1",
    report: "tests/e2e/runs/x-web-local/failures.html#opens-the-card",
  };
  assert.deepEqual(stepsLink(f, {}), { href: f.report, text: "Steps" });
});

test("failure card says the page is gone when the runs folder was cleaned", () => {
  const f = { report: "tests/e2e/runs/x-web-local/failures.html#opens-the-card" };
  const missing = { "tests/e2e/runs/x-web-local/failures.html": "missing" };
  assert.deepEqual(stepsLink(f, missing), { gone: true, text: "page no longer on this computer" });
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

test("failure card reads name, steps before, expected, actual, fix", () => {
  const p = failureParts({
    test: "native business-setup 11",
    name: "owner adds a translation to a program",
    stepsBefore: ["open Programs", "tap Edit"],
    failedStep: "tap Translate",
    expected: "the translation box opens",
    actual: "the Android photo picker opens",
    fixedIn: "not fixed",
    explanation: "proposed item P2.",
    fixFile: "x.tsx",
  });
  assert.equal(p.title, "owner adds a translation to a program");
  assert.equal(p.id, "native business-setup 11");
  assert.deepEqual(p.steps, ["open Programs", "tap Edit", "tap Translate ← breaks here"]);
  assert.equal(p.expected, "the translation box opens");
  assert.equal(p.actual, "the Android photo picker opens");
  assert.equal(p.fix, "Not fixed. proposed item P2.");
  assert.equal(p.fixFile, null);
});

test("failure card of an old run.json uses failedOn as the actual flow", () => {
  const p = failureParts({ test: "web a 1", failedOn: "button covered", fixedIn: "app", explanation: "moved" });
  assert.equal(p.title, "web a 1");
  assert.equal(p.id, null);
  assert.equal(p.actual, "button covered");
  assert.equal(p.expected, null);
  assert.equal(p.fix, "moved");
});
