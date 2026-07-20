import { cpSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "src");
const distRoot = join(root, "dist");

const SHARED_FILES = ["background.js", "popup.html", "popup.css", "popup.js"];
const SHARED_DIRS = ["lib", "vendor", "icons"];

function buildTarget(name, manifestFile) {
  const outDir = join(distRoot, name);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const file of SHARED_FILES) {
    copyFileSync(join(src, file), join(outDir, file));
  }
  for (const dir of SHARED_DIRS) {
    cpSync(join(src, dir), join(outDir, dir), { recursive: true });
  }
  copyFileSync(join(src, manifestFile), join(outDir, "manifest.json"));
  console.log(`built dist/${name}`);
}

buildTarget("chrome", "manifest.chrome.json");
buildTarget("firefox", "manifest.firefox.json");
