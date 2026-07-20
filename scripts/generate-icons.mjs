import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BG_COLOR = [0xd9, 0x77, 0x57, 0xff]; // #D97757, matches the mockup's brand square
const INNER_COLOR = [0xfc, 0xfb, 0xf7, 0xff]; // #FCFBF7, matches the mockup's inner square
const TRANSPARENT = [0, 0, 0, 0];

function isInsideRoundedRect(x, y, width, height, radius) {
  const cx = Math.min(Math.max(x, radius), width - radius);
  const cy = Math.min(Math.max(y, radius), height - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

export function renderIconPNG(size) {
  const png = new PNG({ width: size, height: size });
  const outerRadius = Math.round(size * 0.28);
  const innerSize = Math.round(size * 0.47);
  const innerRadius = Math.round(size * 0.12);
  const innerOffset = Math.round((size - innerSize) / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const insideOuter = isInsideRoundedRect(x, y, size, size, outerRadius);
      let color = insideOuter ? BG_COLOR : TRANSPARENT;

      if (insideOuter) {
        const ix = x - innerOffset;
        const iy = y - innerOffset;
        const insideInner =
          ix >= 0 && ix < innerSize && iy >= 0 && iy < innerSize &&
          isInsideRoundedRect(ix, iy, innerSize, innerSize, innerRadius);
        if (insideInner) color = INNER_COLOR;
      }

      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }

  return PNG.sync.write(png);
}

const SIZES = [16, 32, 48, 128];

function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outDir = join(__dirname, "..", "src", "icons");
  mkdirSync(outDir, { recursive: true });
  for (const size of SIZES) {
    const buffer = renderIconPNG(size);
    writeFileSync(join(outDir, `icon${size}.png`), buffer);
    console.log(`wrote icon${size}.png (${buffer.length} bytes)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
