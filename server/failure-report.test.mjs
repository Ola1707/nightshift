import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stepsLink } from "../public/failure-report.js";
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
