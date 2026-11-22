import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";
import { isBlankPicture } from "./shot-check.mjs";

const dir = mkdtempSync(join(tmpdir(), "shot-check-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const white = (width = 100, height = 100) =>
  sharp({ create: { width, height, channels: 3, background: "#ffffff" } });

test("an all white picture is blank", async () => {
  const path = join(dir, "white.png");
  await white().png().toFile(path);
  assert.equal(await isBlankPicture(path), true);
});

test("a white picture with a 20% black block is not blank", async () => {
  const block = await sharp({
    create: { width: 100, height: 20, channels: 3, background: "#000000" },
  })
    .png()
    .toBuffer();
  const path = join(dir, "block.png");
  await white()
    .composite([{ input: block, top: 40, left: 0 }])
    .png()
    .toFile(path);
  assert.equal(await isBlankPicture(path), false);
});

test("a jpg is checked too, with its compression noise", async () => {
  const blank = join(dir, "white.jpg");
  await white(390, 844).jpeg({ quality: 60 }).toFile(blank);
  assert.equal(await isBlankPicture(blank), true);

  const block = await sharp({
    create: { width: 390, height: 300, channels: 3, background: "#1a3c8f" },
  })
    .png()
    .toBuffer();
  const busy = join(dir, "busy.jpg");
  await white(390, 844)
    .composite([{ input: block, top: 200, left: 0 }])
    .jpeg({ quality: 60 })
    .toFile(busy);
  assert.equal(await isBlankPicture(busy), false);
});
