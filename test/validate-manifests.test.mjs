import { test } from "node:test";
import assert from "node:assert/strict";
import { validateChromeManifest, validateFirefoxManifest } from "../scripts/validate-manifests.mjs";

function validBase() {
  return {
    manifest_version: 3,
    name: "Claude Usage Widget",
    version: "0.1.0",
    permissions: ["storage", "alarms", "notifications"],
    host_permissions: ["https://claude.ai/*", "https://chatgpt.com/*"],
    action: { default_popup: "popup.html" },
    icons: { 16: "a", 32: "a", 48: "a", 128: "a" },
  };
}

test("validateChromeManifest passes a valid manifest", () => {
  const manifest = { ...validBase(), background: { service_worker: "background.js" } };
  assert.deepEqual(validateChromeManifest(manifest), []);
});

test("validateChromeManifest flags a missing service_worker", () => {
  const manifest = { ...validBase(), background: {} };
  const errors = validateChromeManifest(manifest);
  assert.ok(errors.some((e) => e.includes("service_worker")));
});

test("validateChromeManifest flags missing required permissions", () => {
  const manifest = { ...validBase(), permissions: ["storage"], background: { service_worker: "background.js" } };
  const errors = validateChromeManifest(manifest);
  assert.ok(errors.some((e) => e.includes('"alarms"')));
  assert.ok(errors.some((e) => e.includes('"notifications"')));
});

test("validateChromeManifest flags missing host_permissions", () => {
  const manifest = { ...validBase(), host_permissions: [], background: { service_worker: "background.js" } };
  const errors = validateChromeManifest(manifest);
  assert.ok(errors.some((e) => e.includes("host_permissions")));
});

test("validateFirefoxManifest passes a valid manifest", () => {
  const manifest = {
    ...validBase(),
    background: { scripts: ["background.js"] },
    browser_specific_settings: { gecko: { id: "example@example.com" } },
  };
  assert.deepEqual(validateFirefoxManifest(manifest), []);
});

test("validateFirefoxManifest flags missing gecko id", () => {
  const manifest = { ...validBase(), background: { scripts: ["background.js"] } };
  const errors = validateFirefoxManifest(manifest);
  assert.ok(errors.some((e) => e.includes("gecko")));
});

test("validateFirefoxManifest flags empty background.scripts", () => {
  const manifest = {
    ...validBase(),
    background: { scripts: [] },
    browser_specific_settings: { gecko: { id: "example@example.com" } },
  };
  const errors = validateFirefoxManifest(manifest);
  assert.ok(errors.some((e) => e.includes("background.scripts")));
});
