import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { renderIconPNG } from "../scripts/generate-icons.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_BUFFER = readFileSync(join(__dirname, "..", "assets", "logo-source.png"));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("renderIconPNG produces a valid PNG signature", () => {
  const buffer = renderIconPNG(128, SOURCE_BUFFER);
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE));
});

test("renderIconPNG produces the requested dimensions", () => {
  const buffer = renderIconPNG(128, SOURCE_BUFFER);
  const decoded = PNG.sync.read(buffer);
  assert.equal(decoded.width, 128);
  assert.equal(decoded.height, 128);
});

test("renderIconPNG: corner pixels are transparent (matches source's transparent padding)", () => {
  const buffer = renderIconPNG(128, SOURCE_BUFFER);
  const decoded = PNG.sync.read(buffer);
  const idx = (128 * 0 + 0) << 2;
  assert.equal(decoded.data[idx + 3], 0);
});

test("renderIconPNG: preserves the source's orange region", () => {
  // Source (50,250) is deep inside the solid orange region (verified: x=0..300
  // at y=250 is uniform #D97757), so its downsampled neighborhood should stay pure orange.
  const buffer = renderIconPNG(128, SOURCE_BUFFER);
  const decoded = PNG.sync.read(buffer);
  const ox = Math.round((50 / 500) * 128);
  const oy = Math.round((250 / 500) * 128);
  const idx = (128 * oy + ox) << 2;
  assert.equal(decoded.data[idx], 0xd9);
  assert.equal(decoded.data[idx + 1], 0x77);
  assert.equal(decoded.data[idx + 2], 0x57);
  assert.equal(decoded.data[idx + 3], 0xff);
});

test("renderIconPNG: preserves the source's light region", () => {
  // Source (495,250) is deep inside the solid cream region (verified: x=490..499
  // at y=250 is uniform #F8F8F6).
  const buffer = renderIconPNG(128, SOURCE_BUFFER);
  const decoded = PNG.sync.read(buffer);
  const ox = Math.min(127, Math.round((495 / 500) * 128));
  const oy = Math.round((250 / 500) * 128);
  const idx = (128 * oy + ox) << 2;
  assert.equal(decoded.data[idx], 0xf8);
  assert.equal(decoded.data[idx + 1], 0xf8);
  assert.equal(decoded.data[idx + 2], 0xf6);
  assert.equal(decoded.data[idx + 3], 0xff);
});

test("renderIconPNG: produces correctly-sized output at every manifest icon size", () => {
  for (const size of [16, 32, 48, 128]) {
    const buffer = renderIconPNG(size, SOURCE_BUFFER);
    const decoded = PNG.sync.read(buffer);
    assert.equal(decoded.width, size);
    assert.equal(decoded.height, size);
  }
});
