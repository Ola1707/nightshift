import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { pictureProblems, runPictures } from "./run-pictures.mjs";
import { saveReview } from "./runs.mjs";

test("lists the before, after and failure pictures, not videos or URLs", () => {
  const run = {
    tasks: [
      {
        id: "T.1",
        before: [{ label: "a", path: "docs/a.jpg" }],
        after: [
          { label: "b", path: "docs/b.png" },
          { label: "c", path: "https://x/c.png" },
        ],
        videos: [{ label: "v", path: "docs/v.mp4" }],
      },
    ],
    failures: [{ test: "web x.spec.ts 1", screenshot: "docs/f.png" }, { test: "y" }],
  };
  assert.deepEqual(
    runPictures(run).map((p) => p.path),
    ["docs/a.jpg", "docs/b.png", "docs/f.png"],
  );
  assert.deepEqual(runPictures({}), []);
});

test("the review page gets the missing and blank pictures, not the good ones", async () => {
  const dir = mkdtempSync(join(tmpdir(), "run-pictures-"));
  const white = () =>
    sharp({ create: { width: 40, height: 80, channels: 3, background: "#ffffff" } });
  try {
    mkdirSync(join(dir, "docs"));
    await white().jpeg().toFile(join(dir, "docs/white.jpg"));
    const half = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#000000" },
    })
      .png()
      .toBuffer();
    await white()
      .composite([{ input: half, top: 0, left: 0 }])
      .png()
      .toFile(join(dir, "docs/good.png"));
    const run = {
      tasks: [
        {
          id: "T.1",
          before: [{ path: "docs/white.jpg" }],
          after: [{ path: "docs/good.png" }, { path: "docs/gone.png" }],
        },
      ],
    };
    assert.deepEqual(await pictureProblems(run, dir), {
      "docs/white.jpg": "blank",
      "docs/gone.png": "missing",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("review done is allowed with open decisions", () => {
  const repo = mkdtempSync(join(tmpdir(), "save-review-"));
  try {
    const runsDir = join(repo, "docs/release-log");
    mkdirSync(join(runsDir, "night-run-2030-01-05"), { recursive: true });
    const log = "docs/release-log/staging-2030-01-05_0300.md";
    writeFileSync(join(repo, log), "# Release: staging\n");
    writeFileSync(
      join(runsDir, "night-run-2030-01-05/run.json"),
      JSON.stringify({
        title: "Night run 2030-01-05",
        deploys: [{ env: "Staging", log }],
        decisions: [{ id: "run-1", text: "Deployed to staging only." }],
        tasks: [{ id: "T.3", title: "Order form", decisions: [{ id: "T.3-1", text: "x" }] }],
      }),
    );
    const review = saveReview({
      repo,
      runsDir,
      name: "night-run-2030-01-05",
      done: true,
      now: new Date("2030-01-05T08:00:00.000Z"),
    });
    assert.deepEqual(review, { done: true, at: "2030-01-05T08:00:00.000Z" });
    assert.deepEqual(
      JSON.parse(readFileSync(join(runsDir, "night-run-2030-01-05/review.json"), "utf8")),
      review,
    );
    assert.match(readFileSync(join(repo, log), "utf8"), /## Review[\s\S]*Decisions: 0 of 2 ticked/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
