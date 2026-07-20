import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourceDir = join(root, "dist", "firefox");

const apiKey = process.env.AMO_JWT_ISSUER;
const apiSecret = process.env.AMO_JWT_SECRET;

if (!apiKey || !apiSecret) {
  console.error("AMO_JWT_ISSUER and AMO_JWT_SECRET must be set (e.g. via .env) to sign/submit to addons.mozilla.org.");
  process.exit(1);
}

const result = spawnSync(
  "npx",
  [
    "web-ext",
    "sign",
    `--source-dir=${sourceDir}`,
    `--api-key=${apiKey}`,
    `--api-secret=${apiSecret}`,
    "--channel=listed",
    `--artifacts-dir=${join(root, "dist", "firefox-signed")}`,
    `--amo-metadata=${join(__dirname, "amo-metadata.json")}`,
  ],
  { stdio: "inherit", cwd: root },
);

process.exit(result.status ?? 1);
