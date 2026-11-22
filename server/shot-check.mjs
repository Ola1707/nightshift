// A screenshot taken before the page painted is (almost) one color. The board marks such a shot "Blank picture", and
// the run's screenshot step retakes it once.
import sharp from "sharp";

const SHARE = 0.98;
const NEAR = 8;

/**
 * True when 98% or more of the picture's pixels are within 8 of its most common color on each channel.
 * @param {string} path a .png or .jpg file
 * @returns {Promise<boolean>}
 */
export async function isBlankPicture(path) {
  const { data, info } = await sharp(path)
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { channels } = info;
  const pixels = data.length / channels;
  const counts = new Map();
  let top = 0;
  let topCount = 0;
  for (let i = 0; i < data.length; i += channels) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > topCount) {
      top = key;
      topCount = count;
    }
  }
  const [r, g, b] = [(top >> 16) & 255, (top >> 8) & 255, top & 255];
  let near = 0;
  for (let i = 0; i < data.length; i += channels) {
    if (
      Math.abs(data[i] - r) <= NEAR &&
      Math.abs(data[i + 1] - g) <= NEAR &&
      Math.abs(data[i + 2] - b) <= NEAR
    )
      near += 1;
  }
  return near >= pixels * SHARE;
}
