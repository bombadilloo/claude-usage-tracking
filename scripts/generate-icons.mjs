import { PNG } from "pngjs";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Alpha-weighted box filter: averages RGB weighted by alpha (premultiplied)
// so transparent source pixels don't bleed arbitrary color into the edges
// of the resized shape.
export function resizeBoxFilter(srcPng, targetSize) {
  const { width: sw, height: sh, data: src } = srcPng;
  const dst = new PNG({ width: targetSize, height: targetSize });

  for (let oy = 0; oy < targetSize; oy++) {
    const sy0 = Math.floor((oy * sh) / targetSize);
    const sy1 = Math.max(sy0 + 1, Math.floor(((oy + 1) * sh) / targetSize));
    for (let ox = 0; ox < targetSize; ox++) {
      const sx0 = Math.floor((ox * sw) / targetSize);
      const sx1 = Math.max(sx0 + 1, Math.floor(((ox + 1) * sw) / targetSize));

      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const idx = (sw * sy + sx) << 2;
          const a = src[idx + 3];
          rSum += src[idx] * a;
          gSum += src[idx + 1] * a;
          bSum += src[idx + 2] * a;
          aSum += a;
          count++;
        }
      }

      const outIdx = (targetSize * oy + ox) << 2;
      dst.data[outIdx] = aSum > 0 ? Math.round(rSum / aSum) : 0;
      dst.data[outIdx + 1] = aSum > 0 ? Math.round(gSum / aSum) : 0;
      dst.data[outIdx + 2] = aSum > 0 ? Math.round(bSum / aSum) : 0;
      dst.data[outIdx + 3] = Math.round(aSum / count);
    }
  }

  return dst;
}

export function renderIconPNG(size, sourceBuffer) {
  const srcPng = PNG.sync.read(sourceBuffer);
  const resized = resizeBoxFilter(srcPng, size);
  return PNG.sync.write(resized);
}

const SIZES = [16, 32, 48, 128];

function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const sourcePath = join(__dirname, "..", "assets", "logo-source.png");
  const sourceBuffer = readFileSync(sourcePath);
  const outDir = join(__dirname, "..", "src", "icons");
  mkdirSync(outDir, { recursive: true });
  for (const size of SIZES) {
    const buffer = renderIconPNG(size, sourceBuffer);
    writeFileSync(join(outDir, `icon${size}.png`), buffer);
    console.log(`wrote icon${size}.png (${buffer.length} bytes)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
