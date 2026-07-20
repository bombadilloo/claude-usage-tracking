import { test } from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { renderIconPNG } from "../scripts/generate-icons.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("renderIconPNG produces a valid PNG signature", () => {
  const buffer = renderIconPNG(128);
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE));
});

test("renderIconPNG produces the requested dimensions", () => {
  const buffer = renderIconPNG(128);
  const decoded = PNG.sync.read(buffer);
  assert.equal(decoded.width, 128);
  assert.equal(decoded.height, 128);
});

test("renderIconPNG: corner pixels are transparent (rounded corners)", () => {
  const buffer = renderIconPNG(128);
  const decoded = PNG.sync.read(buffer);
  const idx = (128 * 0 + 0) << 2; // top-left pixel
  assert.equal(decoded.data[idx + 3], 0); // alpha channel
});

test("renderIconPNG: center pixel is the inner light color", () => {
  const buffer = renderIconPNG(128);
  const decoded = PNG.sync.read(buffer);
  const idx = (128 * 64 + 64) << 2; // center pixel
  assert.equal(decoded.data[idx], 0xfc); // R
  assert.equal(decoded.data[idx + 1], 0xfb); // G
  assert.equal(decoded.data[idx + 2], 0xf7); // B
  assert.equal(decoded.data[idx + 3], 0xff); // A
});

test("renderIconPNG: edge-midpoint pixel is the outer brand color", () => {
  const buffer = renderIconPNG(128);
  const decoded = PNG.sync.read(buffer);
  const idx = (128 * 64 + 2) << 2; // left edge, vertical middle - outside inner square, inside outer
  assert.equal(decoded.data[idx], 0xd9); // R
  assert.equal(decoded.data[idx + 1], 0x77); // G
  assert.equal(decoded.data[idx + 2], 0x57); // B
});
