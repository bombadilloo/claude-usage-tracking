import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export function validateCommonManifest(manifest) {
  const errors = [];
  if (manifest.manifest_version !== 3) errors.push("manifest_version must be 3");
  if (!manifest.name) errors.push("name is required");
  if (!manifest.version) errors.push("version is required");

  if (!Array.isArray(manifest.permissions)) {
    errors.push("permissions must be an array");
  } else {
    for (const perm of ["storage", "alarms", "notifications"]) {
      if (!manifest.permissions.includes(perm)) errors.push(`permissions must include "${perm}"`);
    }
  }

  const hosts = manifest.host_permissions;
  if (!Array.isArray(hosts) || !hosts.includes("https://claude.ai/*") || !hosts.includes("https://chatgpt.com/*")) {
    errors.push('host_permissions must include "https://claude.ai/*" and "https://chatgpt.com/*"');
  }

  if (manifest.action?.default_popup !== "popup.html") {
    errors.push('action.default_popup must be "popup.html"');
  }

  for (const size of ["16", "32", "48", "128"]) {
    if (!manifest.icons?.[size]) errors.push(`icons["${size}"] is required`);
  }

  return errors;
}

export function validateChromeManifest(manifest) {
  const errors = validateCommonManifest(manifest);
  if (!manifest.background?.service_worker) {
    errors.push("chrome manifest background.service_worker is required");
  }
  return errors;
}

export function validateFirefoxManifest(manifest) {
  const errors = validateCommonManifest(manifest);
  if (!Array.isArray(manifest.background?.scripts) || manifest.background.scripts.length === 0) {
    errors.push("firefox manifest background.scripts must be a non-empty array");
  }
  if (!manifest.browser_specific_settings?.gecko?.id) {
    errors.push("firefox manifest browser_specific_settings.gecko.id is required");
  }
  return errors;
}

function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const chromePath = join(__dirname, "..", "src", "manifest.chrome.json");
  const firefoxPath = join(__dirname, "..", "src", "manifest.firefox.json");

  const chrome = JSON.parse(readFileSync(chromePath, "utf8"));
  const firefox = JSON.parse(readFileSync(firefoxPath, "utf8"));

  const errors = [
    ...validateChromeManifest(chrome).map((e) => `[chrome] ${e}`),
    ...validateFirefoxManifest(firefox).map((e) => `[firefox] ${e}`),
  ];

  if (errors.length > 0) {
    for (const err of errors) console.error(err);
    process.exit(1);
  }
  console.log("Both manifests are valid.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
