# Claude Usage Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome/Firefox browser extension that shows real Claude.ai session/weekly usage limits, reset times, a reset-notification toggle, an opens/time-saved counter, and a Ko-fi donate button — reusing the existing mockup's exact layout.

**Architecture:** Plain HTML/CSS/JS, Manifest V3, no bundler. A background script polls `claude.ai`'s internal usage API on an alarm and writes results to `storage.local`; the popup reads that storage and renders it. Pure logic (formatting, reset-alarm scheduling, API response parsing) lives in `src/lib/*.js` as real ES modules so it can be unit-tested directly with Node's built-in test runner — no browser needed for those tests. Browser-API glue (`background.js`, `popup.js`) is thin and verified manually per the spec's testing approach, since mocking `chrome.*`/`browser.*` wholesale isn't worth the complexity for a project this size.

**Tech Stack:** Vanilla JS (ES modules), Manifest V3, `webextension-polyfill` (vendored, not bundled), `pngjs` (icon generation only, pure JS, no native deps), Node's built-in `node:test` + `node:assert/strict` (no test framework dependency). Node v22 confirmed available.

## Global Constraints

- No build framework/bundler — plain files only (spec: Architecture).
- One codebase for Chrome and Firefox; only the two manifest files differ (spec: Architecture).
- `host_permissions` limited to `https://claude.ai/*`; permissions limited to `storage`, `alarms`, `notifications` — nothing broader (spec: Architecture).
- No CDN dependencies at runtime — `webextension-polyfill` is vendored into the repo, not loaded remotely (spec: Architecture, extended in this plan to icon fonts too — mockup's Google Fonts import is replaced with system font stacks to avoid a runtime network dependency in the popup).
- User must already be logged into claude.ai in that browser; the extension performs no login flow of its own (spec: Data source).
- Icons generated locally via pure-JS `pngjs` — no system image tools, no sudo (spec: Icons).
- `dist/` build output is plain directories per browser (`dist/chrome/`, `dist/firefox/`), not zip files — store submission is explicitly out of scope (spec: Out of scope), so zipping only for sideload testing adds a dependency (`archiver`) for no real benefit; `chrome://extensions` "load unpacked" and Firefox's "load temporary add-on" both consume unpacked directories directly.
- Repo: private GitHub repo `bombadilloo/claude-usage-tracking` already exists. A `GITHUB_TOKEN` and `GITHUB_REPO_URL` are available in a git-ignored `.env` file at the repo root (already created, already confirmed ignored) — never print the token value, never commit it, never put it in any file other than `.env`.
- All file paths in this plan are relative to the repo root: `/home/valde/claude/usage widget/`.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `.nvmrc` (not required, skip — Node version isn't pinned elsewhere in this repo; omit)
- Modify: none

**Interfaces:**
- Produces: `npm test`, `npm run validate-manifests`, `npm run generate-icons`, `npm run build` scripts that later tasks rely on. `pngjs@7.0.0` available as a dependency for Task 8.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claude-usage-widget",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Browser extension showing Claude.ai session/weekly usage limits, reset times, and reset notifications.",
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "validate-manifests": "node scripts/validate-manifests.mjs",
    "generate-icons": "node scripts/generate-icons.mjs",
    "build": "node scripts/build.mjs"
  },
  "dependencies": {
    "pngjs": "7.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd "/home/valde/claude/usage widget" && npm install`
Expected: `pngjs@7.0.0` added, `node_modules/` created (already git-ignored), a `package-lock.json` created.

- [ ] **Step 3: Create directory structure**

Run: `mkdir -p "/home/valde/claude/usage widget/src/lib" "/home/valde/claude/usage widget/src/vendor" "/home/valde/claude/usage widget/src/icons" "/home/valde/claude/usage widget/scripts" "/home/valde/claude/usage widget/test"`
Expected: exit 0, directories exist.

- [ ] **Step 4: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add package.json package-lock.json
git commit -m "chore: scaffold extension project with pngjs dependency"
```

---

### Task 2: `src/lib/format.js` — pure display formatting

**Files:**
- Create: `src/lib/format.js`
- Test: `test/format.test.mjs`

**Interfaces:**
- Produces: `formatTimeSaved(opensCount, secondsPerOpen = 9): string`, `formatResetIn(resetsAtIso, now = new Date()): string`, `formatResetAt(resetsAtIso, now = new Date()): string` — consumed by `popup.js` in Task 11.

- [ ] **Step 1: Write the failing tests**

Create `test/format.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTimeSaved, formatResetIn, formatResetAt } from "../src/lib/format.js";

test("formatTimeSaved: zero opens", () => {
  assert.equal(formatTimeSaved(0), "0 sec");
});

test("formatTimeSaved: under a minute", () => {
  assert.equal(formatTimeSaved(1), "9 sec");
});

test("formatTimeSaved: rounds to minutes once over 60s", () => {
  assert.equal(formatTimeSaved(7), "1 min"); // 63s -> 1.05min -> rounds to 1
});

test("formatTimeSaved: whole hours", () => {
  assert.equal(formatTimeSaved(400), "1 hr"); // 3600s = 60min = 1hr exactly
});

test("formatTimeSaved: hours and minutes", () => {
  assert.equal(formatTimeSaved(467), "1 hr 10 min"); // 4203s -> 70.05min -> 70min -> 1hr 10min
});

test("formatResetIn: future time in hours and minutes", () => {
  const now = new Date("2026-07-20T14:16:00.000Z");
  const resetsAt = new Date("2026-07-20T16:30:00.000Z"); // +134 min
  assert.equal(formatResetIn(resetsAt.toISOString(), now), "2h 14m");
});

test("formatResetIn: future time under an hour", () => {
  const now = new Date("2026-07-20T14:16:00.000Z");
  const resetsAt = new Date("2026-07-20T14:30:00.000Z");
  assert.equal(formatResetIn(resetsAt.toISOString(), now), "14m");
});

test("formatResetIn: past time", () => {
  const now = new Date("2026-07-20T14:16:00.000Z");
  const resetsAt = new Date("2026-07-20T13:00:00.000Z");
  assert.equal(formatResetIn(resetsAt.toISOString(), now), "now");
});

test("formatResetAt: same day returns time only", () => {
  // Built from local wall-clock components (not a UTC ISO string) so this
  // test is timezone-independent: formatResetAt renders in local time.
  const now = new Date(2026, 6, 20, 14, 16, 0);
  const resetsAt = new Date(2026, 6, 20, 16, 30, 0);
  assert.equal(formatResetAt(resetsAt.toISOString(), now), "4:30 PM");
});

test("formatResetAt: different day returns weekday and date", () => {
  const now = new Date(2026, 6, 20, 14, 16, 0); // Monday
  const resetsAt = new Date(2026, 6, 27, 0, 0, 0); // following Monday, local midnight
  assert.equal(formatResetAt(resetsAt.toISOString(), now), "Monday · Jul 27, 12:00 AM");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/format.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/format.js'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/format.js`:

```js
export function formatTimeSaved(opensCount, secondsPerOpen = 9) {
  const totalSeconds = opensCount * secondsPerOpen;
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function formatResetIn(resetsAtIso, now = new Date()) {
  const resetsAt = new Date(resetsAtIso);
  const diffMs = resetsAt.getTime() - now.getTime();
  if (diffMs <= 0) return "now";
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatResetAt(resetsAtIso, now = new Date()) {
  const resetsAt = new Date(resetsAtIso);
  const isSameDay = resetsAt.toDateString() === now.toDateString();
  const time = resetsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (isSameDay) return time;
  const weekday = resetsAt.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = resetsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${weekday} · ${monthDay}, ${time}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/format.test.mjs`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add src/lib/format.js test/format.test.mjs
git commit -m "feat: add pure formatting helpers for usage display"
```

---

### Task 3: `src/lib/reset-scheduler.js` — pure alarm-time calculation

**Files:**
- Create: `src/lib/reset-scheduler.js`
- Test: `test/reset-scheduler.test.mjs`

**Interfaces:**
- Consumes: usage shape `{ session: { pct, resetsAt }, week: { pct, resetsAt } }` (matches `fetchUsage`'s return shape from Task 4).
- Produces: `nextResetAlarm(usage, now = new Date()): string | null` (ISO timestamp of the next reset in the future, or `null` if none) — consumed by `background.js` in Task 9.

- [ ] **Step 1: Write the failing tests**

Create `test/reset-scheduler.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextResetAlarm } from "../src/lib/reset-scheduler.js";

const NOW = new Date("2026-07-20T14:00:00.000Z");

test("returns the earlier of two future resets", () => {
  const usage = {
    session: { pct: 47, resetsAt: "2026-07-20T16:00:00.000Z" },
    week: { pct: 68, resetsAt: "2026-07-27T00:00:00.000Z" },
  };
  assert.equal(nextResetAlarm(usage, NOW), "2026-07-20T16:00:00.000Z");
});

test("skips a reset that's already in the past", () => {
  const usage = {
    session: { pct: 0, resetsAt: "2026-07-20T13:00:00.000Z" }, // past
    week: { pct: 68, resetsAt: "2026-07-27T00:00:00.000Z" },
  };
  assert.equal(nextResetAlarm(usage, NOW), "2026-07-27T00:00:00.000Z");
});

test("returns null when both resets are in the past", () => {
  const usage = {
    session: { pct: 0, resetsAt: "2026-07-20T13:00:00.000Z" },
    week: { pct: 0, resetsAt: "2026-07-19T00:00:00.000Z" },
  };
  assert.equal(nextResetAlarm(usage, NOW), null);
});

test("returns null when usage fields are missing", () => {
  assert.equal(nextResetAlarm({}, NOW), null);
  assert.equal(nextResetAlarm({ session: {} }, NOW), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/reset-scheduler.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/reset-scheduler.js'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/reset-scheduler.js`:

```js
export function nextResetAlarm(usage, now = new Date()) {
  const nowMs = now.getTime();
  const candidates = [];
  if (usage?.session?.resetsAt) candidates.push(new Date(usage.session.resetsAt).getTime());
  if (usage?.week?.resetsAt) candidates.push(new Date(usage.week.resetsAt).getTime());

  const future = candidates.filter((ms) => ms > nowMs);
  if (future.length === 0) return null;
  return new Date(Math.min(...future)).toISOString();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/reset-scheduler.test.mjs`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add src/lib/reset-scheduler.js test/reset-scheduler.test.mjs
git commit -m "feat: add pure reset-alarm scheduling logic"
```

---

### Task 4: `src/lib/usage-api.js` — claude.ai usage API client

**Files:**
- Create: `src/lib/usage-api.js`
- Test: `test/usage-api.test.mjs`

**Interfaces:**
- Produces: `class UsageApiError extends Error` with a `.status` property; `fetchOrgId(fetchImpl = fetch): Promise<string>`; `fetchUsage(orgId, fetchImpl = fetch): Promise<{ session: {pct, resetsAt}, week: {pct, resetsAt} }>`; `fetchOrgIdAndUsage(fetchImpl = fetch): Promise<{ orgId, usage }>` — consumed by `background.js` in Task 9.
- `fetchImpl` is dependency-injected specifically so tests never make a real network call.

- [ ] **Step 1: Write the failing tests**

Create `test/usage-api.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchOrgId, fetchUsage, fetchOrgIdAndUsage, UsageApiError } from "../src/lib/usage-api.js";

function fakeFetch(responses) {
  let call = 0;
  return async (url) => {
    const response = responses[call];
    call += 1;
    return response;
  };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("fetchOrgId returns the first org's uuid", async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, [{ uuid: "org-123" }, { uuid: "org-456" }])]);
  const orgId = await fetchOrgId(fetchImpl);
  assert.equal(orgId, "org-123");
});

test("fetchOrgId throws UsageApiError with status 401 when logged out", async () => {
  const fetchImpl = fakeFetch([jsonResponse(401, {})]);
  await assert.rejects(() => fetchOrgId(fetchImpl), (err) => {
    assert.ok(err instanceof UsageApiError);
    assert.equal(err.status, 401);
    return true;
  });
});

test("fetchOrgId throws when the org list is empty", async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, [])]);
  await assert.rejects(() => fetchOrgId(fetchImpl), UsageApiError);
});

test("fetchUsage maps five_hour/seven_day into session/week", async () => {
  const fetchImpl = fakeFetch([
    jsonResponse(200, {
      five_hour: { utilization: 47, resets_at: "2026-07-20T16:30:00.000Z" },
      seven_day: { utilization: 68, resets_at: "2026-07-27T00:00:00.000Z" },
    }),
  ]);
  const usage = await fetchUsage("org-123", fetchImpl);
  assert.deepEqual(usage, {
    session: { pct: 47, resetsAt: "2026-07-20T16:30:00.000Z" },
    week: { pct: 68, resetsAt: "2026-07-27T00:00:00.000Z" },
  });
});

test("fetchUsage throws UsageApiError on unexpected shape", async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, { unexpected: true })]);
  await assert.rejects(() => fetchUsage("org-123", fetchImpl), UsageApiError);
});

test("fetchUsage throws with status on server error", async () => {
  const fetchImpl = fakeFetch([jsonResponse(500, {})]);
  await assert.rejects(() => fetchUsage("org-123", fetchImpl), (err) => {
    assert.equal(err.status, 500);
    return true;
  });
});

test("fetchOrgIdAndUsage chains both calls", async () => {
  const fetchImpl = fakeFetch([
    jsonResponse(200, [{ uuid: "org-123" }]),
    jsonResponse(200, {
      five_hour: { utilization: 10, resets_at: "2026-07-20T16:30:00.000Z" },
      seven_day: { utilization: 20, resets_at: "2026-07-27T00:00:00.000Z" },
    }),
  ]);
  const result = await fetchOrgIdAndUsage(fetchImpl);
  assert.equal(result.orgId, "org-123");
  assert.equal(result.usage.session.pct, 10);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/usage-api.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/usage-api.js'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/usage-api.js`:

```js
const BASE_URL = "https://claude.ai/api";

export class UsageApiError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = "UsageApiError";
    this.status = status;
  }
}

export async function fetchOrgId(fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE_URL}/organizations`, { credentials: "include" });
  if (res.status === 401 || res.status === 403) {
    throw new UsageApiError("Not logged into claude.ai", { status: res.status });
  }
  if (!res.ok) {
    throw new UsageApiError(`Failed to list organizations (${res.status})`, { status: res.status });
  }
  const orgs = await res.json();
  if (!Array.isArray(orgs) || orgs.length === 0 || !orgs[0]?.uuid) {
    throw new UsageApiError("No organizations found for this account");
  }
  return orgs[0].uuid;
}

export async function fetchUsage(orgId, fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE_URL}/organizations/${orgId}/usage`, { credentials: "include" });
  if (res.status === 401 || res.status === 403) {
    throw new UsageApiError("Not logged into claude.ai", { status: res.status });
  }
  if (!res.ok) {
    throw new UsageApiError(`Failed to fetch usage (${res.status})`, { status: res.status });
  }
  const data = await res.json();
  if (!data.five_hour || !data.seven_day) {
    throw new UsageApiError("Unexpected usage response shape");
  }
  return {
    session: { pct: data.five_hour.utilization, resetsAt: data.five_hour.resets_at },
    week: { pct: data.seven_day.utilization, resetsAt: data.seven_day.resets_at },
  };
}

export async function fetchOrgIdAndUsage(fetchImpl = fetch) {
  const orgId = await fetchOrgId(fetchImpl);
  const usage = await fetchUsage(orgId, fetchImpl);
  return { orgId, usage };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/usage-api.test.mjs`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add src/lib/usage-api.js test/usage-api.test.mjs
git commit -m "feat: add claude.ai usage API client with injectable fetch"
```

---

### Task 5: `scripts/validate-manifests.mjs` — manifest shape guard

**Files:**
- Create: `scripts/validate-manifests.mjs`
- Test: `test/validate-manifests.test.mjs`

**Interfaces:**
- Produces: `validateChromeManifest(manifest): string[]`, `validateFirefoxManifest(manifest): string[]` (empty array = valid) — consumed directly by this task's own CLI, and by Task 6's verification step.
- The CLI entry point reads `src/manifest.chrome.json` and `src/manifest.firefox.json` — those files don't exist yet (created in Task 6), so the CLI itself isn't run in this task, only its exported functions are unit-tested.

- [ ] **Step 1: Write the failing tests**

Create `test/validate-manifests.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateChromeManifest, validateFirefoxManifest } from "../scripts/validate-manifests.mjs";

function validBase() {
  return {
    manifest_version: 3,
    name: "Claude Usage Widget",
    version: "0.1.0",
    permissions: ["storage", "alarms", "notifications"],
    host_permissions: ["https://claude.ai/*"],
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/validate-manifests.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/validate-manifests.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/validate-manifests.mjs`:

```js
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

  if (!Array.isArray(manifest.host_permissions) || !manifest.host_permissions.includes("https://claude.ai/*")) {
    errors.push('host_permissions must include "https://claude.ai/*"');
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/validate-manifests.test.mjs`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add scripts/validate-manifests.mjs test/validate-manifests.test.mjs
git commit -m "feat: add manifest validation script"
```

---

### Task 6: The two manifests

**Files:**
- Create: `src/manifest.chrome.json`
- Create: `src/manifest.firefox.json`

**Interfaces:**
- Consumes: `validateChromeManifest`/`validateFirefoxManifest` from Task 5 (used to verify, not imported at runtime).
- Produces: the `background.js`/`popup.html`/`icons/*` paths these manifests reference — Tasks 7–11 must create files at exactly these paths.

- [ ] **Step 1: Create `src/manifest.chrome.json`**

```json
{
  "manifest_version": 3,
  "name": "Claude Usage Widget",
  "version": "0.1.0",
  "description": "See your Claude.ai session and weekly usage limits, when they reset, and get notified on reset.",
  "permissions": ["storage", "alarms", "notifications"],
  "host_permissions": ["https://claude.ai/*"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Create `src/manifest.firefox.json`**

```json
{
  "manifest_version": 3,
  "name": "Claude Usage Widget",
  "version": "0.1.0",
  "description": "See your Claude.ai session and weekly usage limits, when they reset, and get notified on reset.",
  "permissions": ["storage", "alarms", "notifications"],
  "host_permissions": ["https://claude.ai/*"],
  "background": {
    "scripts": ["background.js"],
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "claude-usage-widget@bombadilloo.dev",
      "strict_min_version": "109.0"
    }
  }
}
```

- [ ] **Step 3: Validate both manifests**

Run: `cd "/home/valde/claude/usage widget" && npm run validate-manifests`
Expected: `Both manifests are valid.` and exit code 0.

(This confirms the JSON is well-formed and structurally correct even though `background.js`, `popup.html`, and the icons it references don't exist as files yet — that's fine, `validate-manifests` only checks the manifest's own shape, not that referenced files exist on disk.)

- [ ] **Step 4: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add src/manifest.chrome.json src/manifest.firefox.json
git commit -m "feat: add Chrome and Firefox MV3 manifests"
```

---

### Task 7: Vendor `webextension-polyfill`

**Files:**
- Create: `src/vendor/browser-polyfill.js`
- Create: `src/vendor/browser-polyfill.LICENSE`

**Interfaces:**
- Produces: a global `browser` object (Promise-based, matches Firefox's native API) available after `import "./vendor/browser-polyfill.js";` — consumed by `background.js` (Task 9) and `popup.js` (Task 11). It's a side-effect-only import: it sets `globalThis.browser` and doesn't need an import binding.

- [ ] **Step 1: Download the pinned version (0.12.0) of the polyfill**

Run:
```bash
curl -sL -o "/home/valde/claude/usage widget/src/vendor/browser-polyfill.js" \
  https://unpkg.com/webextension-polyfill@0.12.0/dist/browser-polyfill.js
curl -sL -o "/home/valde/claude/usage widget/src/vendor/browser-polyfill.LICENSE" \
  https://unpkg.com/webextension-polyfill@0.12.0/LICENSE
```
Expected: both files created, non-empty.

- [ ] **Step 2: Verify the download**

Run: `head -c 200 "/home/valde/claude/usage widget/src/vendor/browser-polyfill.js"`
Expected: output starts with `(function (global, factory) {` and the file mentions `v0.12.0` a few lines further down. Also run `wc -c "/home/valde/claude/usage widget/src/vendor/browser-polyfill.js"` — expect roughly 38KB (38440 bytes as of this writing; a wildly different size means the download didn't get the real file).

This file uses `globalThis.browser = ...` (no ES `export`), which is why `background.js`/`popup.js` import it for its side effect only (`import "./vendor/browser-polyfill.js";`) rather than importing a named/default export.

- [ ] **Step 3: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add src/vendor/browser-polyfill.js src/vendor/browser-polyfill.LICENSE
git commit -m "chore: vendor webextension-polyfill 0.12.0 (MPL-2.0)"
```

---

### Task 8: `scripts/generate-icons.mjs` — icon generation

**Files:**
- Create: `scripts/generate-icons.mjs`
- Test: `test/generate-icons.test.mjs`

**Interfaces:**
- Consumes: `pngjs` (installed in Task 1).
- Produces: `renderIconPNG(size: number): Buffer` (pure, testable); its CLI writes `src/icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` — these paths are exactly what `manifest.chrome.json`/`manifest.firefox.json` (Task 6) reference.

- [ ] **Step 1: Write the failing tests**

Create `test/generate-icons.test.mjs`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/generate-icons.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/generate-icons.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/generate-icons.mjs`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/generate-icons.test.mjs`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Generate the actual icon files**

Run: `cd "/home/valde/claude/usage widget" && npm run generate-icons`
Expected: four `wrote iconNN.png (... bytes)` lines, and `src/icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` exist.

- [ ] **Step 6: Re-run manifest validation now that referenced files exist**

Run: `npm run validate-manifests`
Expected: `Both manifests are valid.`

- [ ] **Step 7: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add scripts/generate-icons.mjs test/generate-icons.test.mjs src/icons/
git commit -m "feat: generate extension icons with pure-JS PNG rasterizer"
```

---

### Task 9: `src/background.js` — polling, alarms, notifications

**Files:**
- Create: `src/background.js`

**Interfaces:**
- Consumes: `fetchOrgId`, `fetchUsage`, `UsageApiError` from `src/lib/usage-api.js` (Task 4); `nextResetAlarm` from `src/lib/reset-scheduler.js` (Task 3); global `browser` from `src/vendor/browser-polyfill.js` (Task 7).
- Produces (storage.local keys consumed by `popup.js` in Task 11): `orgId: string`, `loggedIn: boolean`, `session: {pct, resetsAt}`, `week: {pct, resetsAt}`, `lastUpdated: number`, `stale: boolean`, `notificationsOn: boolean` (read, not written, by background — popup owns writing this), `notificationsDenied: boolean`.
- Produces (message API consumed by `popup.js`): listens for `browser.runtime.sendMessage({ type: "refresh" })` and triggers an immediate poll.
- This file is browser-API glue (chrome.alarms/storage/notifications) — no automated test here; it's verified manually in Step 3 below, consistent with the spec's Testing section.

- [ ] **Step 1: Write the implementation**

Create `src/background.js`:

```js
import "./vendor/browser-polyfill.js";
import { fetchOrgId, fetchUsage, UsageApiError } from "./lib/usage-api.js";
import { nextResetAlarm } from "./lib/reset-scheduler.js";

const POLL_ALARM = "usage-poll";
const RESET_ALARM = "usage-reset-notify";
const POLL_INTERVAL_MINUTES = 5;

async function getCachedOrgId() {
  const { orgId } = await browser.storage.local.get("orgId");
  return orgId ?? null;
}

async function resolveOrgId({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = await getCachedOrgId();
    if (cached) return cached;
  }
  const orgId = await fetchOrgId();
  await browser.storage.local.set({ orgId });
  return orgId;
}

async function scheduleResetNotification(usage) {
  const { notificationsOn } = await browser.storage.local.get("notificationsOn");
  if (notificationsOn === false) {
    await browser.alarms.clear(RESET_ALARM);
    return;
  }
  const next = nextResetAlarm(usage);
  if (!next) {
    await browser.alarms.clear(RESET_ALARM);
    return;
  }
  await browser.alarms.create(RESET_ALARM, { when: new Date(next).getTime() });
}

async function pollUsage() {
  try {
    let orgId = await resolveOrgId();
    let usage;
    try {
      usage = await fetchUsage(orgId);
    } catch (err) {
      const isAuthError = err instanceof UsageApiError && (err.status === 401 || err.status === 403);
      if (!isAuthError) throw err;
      orgId = await resolveOrgId({ forceRefresh: true });
      usage = await fetchUsage(orgId);
    }

    await browser.storage.local.set({
      loggedIn: true,
      session: usage.session,
      week: usage.week,
      lastUpdated: Date.now(),
      stale: false,
    });
    await scheduleResetNotification(usage);
  } catch (err) {
    const isAuthError = err instanceof UsageApiError && (err.status === 401 || err.status === 403);
    if (isAuthError) {
      await browser.storage.local.set({ loggedIn: false });
      await browser.alarms.clear(RESET_ALARM);
      return;
    }
    await browser.storage.local.set({ stale: true });
  }
}

async function fireResetNotification() {
  let denied = false;
  if (browser.notifications.getPermissionLevel) {
    const level = await browser.notifications.getPermissionLevel();
    denied = level !== "granted";
  }
  await browser.storage.local.set({ notificationsDenied: denied });
  if (denied) return;

  await browser.notifications.create(`reset-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Claude usage limit reset",
    message: "Your session or weekly usage limit just refreshed.",
  });
}

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLL_ALARM) {
    await pollUsage();
  } else if (alarm.name === RESET_ALARM) {
    await fireResetNotification();
    await pollUsage();
  }
});

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes.notificationsOn) return;
  const { session, week } = await browser.storage.local.get(["session", "week"]);
  if (session && week) {
    await scheduleResetNotification({ session, week });
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "refresh") {
    pollUsage();
  }
});

browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MINUTES });
  pollUsage();
});

browser.runtime.onStartup.addListener(() => {
  pollUsage();
});
```

- [ ] **Step 2: Load the extension unpacked in Chrome to sanity-check the background script loads without errors**

Run: open Chrome → `chrome://extensions` → enable Developer mode → "Load unpacked" → select `src/` (with `manifest.chrome.json` temporarily copied/renamed to `manifest.json`, since Chrome always looks for that exact filename — see the note in Task 12; for this quick manual check it's fine to `cp src/manifest.chrome.json src/manifest.json` temporarily and remove it afterward, since `manifest.json` isn't part of any git-tracked file list and `src/icons`, `src/background.js` etc. already exist from prior tasks).

Expected: extension loads with no red "Errors" button. Click "service worker" (Inspect views) to open its console — expect no thrown exceptions on load. Because there's no `popup.html`/`popup.js` yet (Task 10–11), the toolbar icon click won't open anything meaningful yet — that's expected at this point in the plan.

- [ ] **Step 3: Clean up the temporary manifest copy**

Run: `rm "/home/valde/claude/usage widget/src/manifest.json"`

- [ ] **Step 4: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add src/background.js
git commit -m "feat: add background script for polling, alarms, and reset notifications"
```

---

### Task 10: `src/popup.html` + `src/popup.css` — popup markup and styling

**Files:**
- Create: `src/popup.html`
- Create: `src/popup.css`

**Interfaces:**
- Produces: DOM element ids consumed by `popup.js` in Task 11: `state-loading`, `state-logged-out`, `state-loaded`, `session-pct`, `session-bar`, `session-reset`, `week-pct`, `week-bar`, `week-reset`, `stale-note`, `notif-toggle`, `notif-denied-note`, `opens-count`, `time-saved`.
- Deviates from the mockup's Google Fonts (`Newsreader`, `Hanken Grotesk`) — those require a runtime network fetch on every popup open, which conflicts with this project's no-CDN-at-runtime constraint (see Global Constraints). Uses `Georgia, 'Times New Roman', serif` in place of Newsreader for the percentage numerals, and the system UI sans stack in place of Hanken Grotesk. Colors, spacing, and layout are otherwise a direct port of the mockup's standalone-popup block.

- [ ] **Step 1: Create `src/popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="popup">
    <header class="header">
      <div class="header-left">
        <div class="brand-icon"><span class="brand-icon-inner"></span></div>
        <div>
          <div class="title">Usage</div>
          <div class="subtitle">Resets shown in your local time</div>
        </div>
      </div>
    </header>

    <div id="state-loading" class="state-message">Loading your usage…</div>

    <div id="state-logged-out" class="state-message" hidden>
      Log in to <a href="https://claude.ai" target="_blank" rel="noopener">claude.ai</a> to see your usage.
    </div>

    <div id="state-loaded" hidden>
      <div id="stale-note" class="note" hidden>Showing last-known data — will retry shortly.</div>

      <div class="meters">
        <div class="meter">
          <div class="meter-row">
            <span class="meter-label">Session</span>
            <span class="meter-value"><span id="session-pct">0</span><span class="pct-sign">%</span></span>
          </div>
          <div class="meter-track"><div id="session-bar" class="meter-fill" style="width: 0%"></div></div>
          <div id="session-reset" class="meter-reset"></div>
        </div>
        <div class="meter">
          <div class="meter-row">
            <span class="meter-label">This week</span>
            <span class="meter-value"><span id="week-pct">0</span><span class="pct-sign">%</span></span>
          </div>
          <div class="meter-track"><div id="week-bar" class="meter-fill" style="width: 0%"></div></div>
          <div id="week-reset" class="meter-reset"></div>
        </div>
      </div>

      <div class="notif-row">
        <div class="notif-label">
          <span class="notif-icon" aria-hidden="true">&#128276;</span>
          <div>
            <div class="notif-title">Reset notifications</div>
            <div class="notif-subtitle">Ping me when limits refresh</div>
          </div>
        </div>
        <button id="notif-toggle" class="toggle" type="button" role="switch" aria-checked="false"></button>
      </div>
      <div id="notif-denied-note" class="note" hidden>Notifications are blocked at the OS/browser level.</div>

      <div class="footer-stat">
        <span>Opened <strong id="opens-count">0×</strong></span>
        <span>&asymp; <strong id="time-saved">0 sec</strong> saved</span>
      </div>

      <a class="kofi-button" href="https://ko-fi.com/bombadillo" target="_blank" rel="noopener">
        <span aria-hidden="true">&#9749;</span> Support on Ko-fi
      </a>
    </div>
  </div>

  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/popup.css`**

```css
* { box-sizing: border-box; }

body {
  margin: 0;
  width: 356px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #FCFBF7;
  color: #38352E;
}

.popup { display: flex; flex-direction: column; }

.header {
  padding: 18px 20px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(60,55,45,0.07);
}
.header-left { display: flex; align-items: center; gap: 11px; }

.brand-icon {
  width: 32px; height: 32px; border-radius: 9px;
  background: #D97757;
  display: flex; align-items: center; justify-content: center;
}
.brand-icon-inner { width: 15px; height: 15px; border-radius: 4px; background: #FCFBF7; display: block; }

.title { font-size: 15px; font-weight: 600; color: #23211C; letter-spacing: -0.01em; }
.subtitle { font-size: 11.5px; color: #9b968a; margin-top: 1px; }

.state-message { padding: 24px 20px; font-size: 13px; color: #6f6a5e; text-align: center; }
.state-message a { color: #C25E45; }

.note {
  margin: 12px 20px 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: #F4F1E8;
  font-size: 11px;
  color: #6f6a5e;
}

.meters { padding: 18px 20px 6px; display: flex; flex-direction: column; gap: 20px; }
.meter-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; }
.meter-label { font-size: 13px; font-weight: 600; color: #38352E; }
.meter-value { font-family: Georgia, "Times New Roman", serif; font-size: 15px; color: #C25E45; font-weight: 500; }
.pct-sign { font-size: 11px; color: #a5a094; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.meter-track { height: 9px; border-radius: 6px; background: #EBE7DC; overflow: hidden; }
.meter-fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg,#E08A6E,#D97757); transition: width 0.3s ease; }
.meter-reset { margin-top: 7px; font-size: 11.5px; color: #9b968a; }

.notif-row {
  margin: 16px 20px 0;
  padding: 13px 15px;
  background: #F4F1E8;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.notif-label { display: flex; align-items: center; gap: 10px; }
.notif-icon { font-size: 15px; }
.notif-title { font-size: 12.5px; font-weight: 600; color: #38352E; }
.notif-subtitle { font-size: 11px; color: #9b968a; margin-top: 1px; }

.toggle {
  width: 40px; height: 23px; border-radius: 12px;
  background: #D6D1C4;
  position: relative; flex-shrink: 0;
  border: none; cursor: pointer; padding: 0;
}
.toggle::after {
  content: "";
  position: absolute; top: 2.5px; left: 2.5px;
  width: 18px; height: 18px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  transition: left 0.15s ease;
}
.toggle.on { background: #D97757; }
.toggle.on::after { left: 19.5px; }

.footer-stat {
  margin: 14px 20px 0;
  padding-top: 14px;
  border-top: 1px solid rgba(60,55,45,0.07);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: #9b968a;
}
.footer-stat strong { color: #6f6a5e; }
.footer-stat strong#time-saved { color: #C25E45; }

.kofi-button {
  margin: 16px 20px 20px;
  text-decoration: none;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px; border-radius: 12px;
  background: #38352E; color: #FCFBF7;
  font-size: 13px; font-weight: 600; letter-spacing: 0.01em;
}
.kofi-button:hover { background: #2a2822; }
```

- [ ] **Step 3: Open the file directly in a browser to sanity-check layout**

Run: open `src/popup.html` directly (e.g. `file:///home/valde/claude/usage widget/src/popup.html`) in a browser tab.
Expected: renders the "Loading your usage…" state (since `popup.js` doesn't exist yet, nothing will hide it) at 356px wide, styled per the mockup's colors/spacing — visually confirms markup/CSS before wiring behavior in Task 11.

- [ ] **Step 4: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add src/popup.html src/popup.css
git commit -m "feat: add popup markup and styling ported from the mockup"
```

---

### Task 11: `src/popup.js` — wiring popup to storage and state

**Files:**
- Create: `src/popup.js`

**Interfaces:**
- Consumes: `formatTimeSaved`, `formatResetIn`, `formatResetAt` from `src/lib/format.js` (Task 2); global `browser` from `src/vendor/browser-polyfill.js` (Task 7); the storage.local keys `background.js` (Task 9) writes; the DOM ids from `popup.html` (Task 10).
- Produces: increments `opensCount` in `storage.local` on every popup open; writes `notificationsOn` in `storage.local` on toggle click (read back by `background.js`'s `storage.onChanged` listener).
- This file is browser-API/DOM glue — no automated test; verified manually in Step 2.

- [ ] **Step 1: Write the implementation**

Create `src/popup.js`:

```js
import "./vendor/browser-polyfill.js";
import { formatTimeSaved, formatResetIn, formatResetAt } from "./lib/format.js";

const els = {
  loading: document.getElementById("state-loading"),
  loggedOut: document.getElementById("state-logged-out"),
  loaded: document.getElementById("state-loaded"),
  staleNote: document.getElementById("stale-note"),
  sessionPct: document.getElementById("session-pct"),
  sessionBar: document.getElementById("session-bar"),
  sessionReset: document.getElementById("session-reset"),
  weekPct: document.getElementById("week-pct"),
  weekBar: document.getElementById("week-bar"),
  weekReset: document.getElementById("week-reset"),
  notifToggle: document.getElementById("notif-toggle"),
  notifDenied: document.getElementById("notif-denied-note"),
  opensCount: document.getElementById("opens-count"),
  timeSaved: document.getElementById("time-saved"),
};

function setState(name) {
  els.loading.hidden = name !== "loading";
  els.loggedOut.hidden = name !== "logged-out";
  els.loaded.hidden = name !== "loaded";
}

function renderMeters(session, week, stale) {
  const now = new Date();
  const sessionPct = Math.round(session.pct);
  els.sessionPct.textContent = String(sessionPct);
  els.sessionBar.style.width = `${Math.min(100, sessionPct)}%`;
  els.sessionReset.textContent = `Resets in ${formatResetIn(session.resetsAt, now)} · ${formatResetAt(session.resetsAt, now)}`;

  const weekPct = Math.round(week.pct);
  els.weekPct.textContent = String(weekPct);
  els.weekBar.style.width = `${Math.min(100, weekPct)}%`;
  els.weekReset.textContent = `Resets ${formatResetAt(week.resetsAt, now)}`;

  els.staleNote.hidden = !stale;
}

function renderNotifToggle(notificationsOn, notificationsDenied) {
  els.notifToggle.setAttribute("aria-checked", String(notificationsOn));
  els.notifToggle.classList.toggle("on", notificationsOn);
  els.notifDenied.hidden = !notificationsDenied;
}

function renderFooter(opensCount) {
  els.opensCount.textContent = `${opensCount}×`;
  els.timeSaved.textContent = formatTimeSaved(opensCount);
}

async function bumpOpensCount() {
  const { opensCount = 0 } = await browser.storage.local.get("opensCount");
  const next = opensCount + 1;
  await browser.storage.local.set({ opensCount: next });
  return next;
}

async function render() {
  const stored = await browser.storage.local.get([
    "loggedIn", "session", "week", "stale", "notificationsOn", "notificationsDenied", "opensCount",
  ]);

  if (stored.loggedIn === false) {
    setState("logged-out");
    return;
  }
  if (!stored.session || !stored.week) {
    setState("loading");
    return;
  }

  setState("loaded");
  renderMeters(stored.session, stored.week, Boolean(stored.stale));
  renderNotifToggle(stored.notificationsOn !== false, Boolean(stored.notificationsDenied));
  renderFooter(stored.opensCount ?? 0);
}

async function init() {
  await bumpOpensCount();
  await render();
  browser.runtime.sendMessage({ type: "refresh" }).catch(() => {});
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local") render();
});

els.notifToggle.addEventListener("click", async () => {
  const { notificationsOn } = await browser.storage.local.get("notificationsOn");
  const currentlyOn = notificationsOn !== false;
  await browser.storage.local.set({ notificationsOn: !currentlyOn });
});

init();
```

- [ ] **Step 2: Manually verify in Chrome (requires being logged into claude.ai)**

Run: `cp "/home/valde/claude/usage widget/src/manifest.chrome.json" "/home/valde/claude/usage widget/src/manifest.json"`, then in Chrome: `chrome://extensions` → reload the already-loaded-unpacked extension (or load it fresh from `src/`) → click its toolbar icon.

Expected, if logged into claude.ai in that Chrome profile:
- Popup opens at 356px showing "Loading your usage…" briefly, then two meters with real percentages and reset times.
- Clicking the notification toggle flips it visually and persists across close/reopen.
- Closing and reopening the popup increments the opens count and time-saved figure.
- Opening the background service worker console (from `chrome://extensions`) shows no thrown errors, and `browser.storage.local.get(null)` (run in that console) shows `session`, `week`, `orgId`, `lastUpdated` populated.

Expected, if NOT logged into claude.ai (test in an Incognito window with the extension allowed, and no claude.ai session): popup shows "Log in to claude.ai to see your usage."

- [ ] **Step 3: Clean up the temporary manifest copy**

Run: `rm "/home/valde/claude/usage widget/src/manifest.json"`

- [ ] **Step 4: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add src/popup.js
git commit -m "feat: wire popup to live storage data and notification toggle"
```

---

### Task 12: `scripts/build.mjs` — per-browser dist output

**Files:**
- Create: `scripts/build.mjs`

**Interfaces:**
- Consumes: all files under `src/` from prior tasks.
- Produces: `dist/chrome/` and `dist/firefox/`, each a flat, loadable extension directory with `manifest.json` (renamed from the browser-specific source manifest — both Chrome's "load unpacked" and Firefox's "load temporary add-on" require the file to be named exactly `manifest.json`, which is why `src/` keeps them as `manifest.chrome.json`/`manifest.firefox.json` and this build step is what produces the correctly-named file per target).

- [ ] **Step 1: Write the implementation**

Create `scripts/build.mjs`:

```js
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
```

- [ ] **Step 2: Run the build and verify output**

Run:
```bash
cd "/home/valde/claude/usage widget"
npm run build
ls dist/chrome dist/firefox
cat dist/chrome/manifest.json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('chrome manifest.json OK')"
cat dist/firefox/manifest.json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('firefox manifest.json OK')"
```
Expected: `built dist/chrome` and `built dist/firefox` printed; both `ls` calls show `background.js icons lib manifest.json popup.css popup.html popup.js vendor`; both `JSON.parse` checks print their `OK` line without throwing.

- [ ] **Step 3: Load `dist/chrome` in Chrome and `dist/firefox` in Firefox as a final cross-browser check**

Run: `chrome://extensions` → load unpacked → `dist/chrome`. Separately, Firefox → `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → pick any file inside `dist/firefox` (e.g. `manifest.json`).
Expected: extension loads with no errors in both browsers; popup opens and behaves as verified in Task 11 Step 2 in both.

- [ ] **Step 4: Commit**

```bash
cd "/home/valde/claude/usage widget"
git add scripts/build.mjs
git commit -m "feat: add per-browser dist build script"
```

(`dist/` itself is git-ignored — only the script is committed.)

---

### Task 13: README, full test run, and push to GitHub

**Files:**
- Create: `README.md`

**Interfaces:**
- None — this is the final wrap-up task.

- [ ] **Step 1: Create `README.md`**

```markdown
# Claude Usage Widget

A Chrome/Firefox extension that shows your Claude.ai session (5-hour) and
weekly (7-day) usage limits, when they reset, without opening claude.ai.

## Requirements

You must be logged into claude.ai in the same browser — the extension reads
your existing session, it does not implement its own login.

## Features

- Session and weekly usage meters with reset times
- Toggle for a desktop notification when a limit resets
- Tracks how many times you've opened the popup and estimates time saved
  vs. checking claude.ai manually (9s per check)
- Ko-fi donate button

## Development

```bash
npm install
npm test                  # run all unit tests
npm run validate-manifests
npm run generate-icons    # regenerate src/icons/*.png
npm run build              # produce dist/chrome and dist/firefox
```

## Loading the extension

**Chrome:** `chrome://extensions` → enable Developer mode → "Load unpacked"
→ select `dist/chrome` (run `npm run build` first).

**Firefox:** `about:debugging#/runtime/this-firefox` → "Load Temporary
Add-on…" → select `dist/firefox/manifest.json` (run `npm run build` first).

## How it works

Polls `https://claude.ai/api/organizations/{orgId}/usage`, an internal
(undocumented) endpoint the claude.ai web app itself uses, authenticated via
your existing browser session cookie. This endpoint isn't a stable public
API and may change without notice.

## Support

If this is useful, consider [buying me a coffee](https://ko-fi.com/bombadillo).
```

- [ ] **Step 2: Run the full test suite**

Run: `cd "/home/valde/claude/usage widget" && npm test`
Expected: all test files pass (format, reset-scheduler, usage-api, validate-manifests, generate-icons — 33 tests total across the 5 files written in this plan).

- [ ] **Step 3: Run manifest validation one final time**

Run: `npm run validate-manifests`
Expected: `Both manifests are valid.`

- [ ] **Step 4: Commit the README**

```bash
cd "/home/valde/claude/usage widget"
git add README.md
git commit -m "docs: add README with setup and load-unpacked instructions"
```

- [ ] **Step 5: Push to the private GitHub repo**

The repo `bombadilloo/claude-usage-tracking` already exists (created by the
user before this plan). Credentials are in the git-ignored `.env` file at
the repo root (`GITHUB_TOKEN`, `GITHUB_REPO_URL`) — never echo the token
value, never write it anywhere but `.env`.

Run:
```bash
cd "/home/valde/claude/usage widget"
set -a; source .env; set +a
git remote add origin "$GITHUB_REPO_URL"
git push "https://${GITHUB_TOKEN}@github.com/bombadilloo/claude-usage-tracking.git" main:main
git branch --set-upstream-to=origin/main main
```
Expected: push succeeds (`main -> main`), `git remote -v` shows `origin` pointing at the clean (tokenless) `GITHUB_REPO_URL`, and `git status` shows `Your branch is up to date with 'origin/main'.` The token is never written into `.git/config` because the ad-hoc push URL (with the embedded token) is only ever used as a one-off command argument, not as the configured remote.

- [ ] **Step 6: Verify on GitHub**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "https://api.github.com/repos/bombadilloo/claude-usage-tracking"` — this only confirms the repo endpoint responds; since it's private, an unauthenticated check will return 404 (expected — that's fine, it confirms nothing more than DNS/network). For real confirmation, load `https://github.com/bombadilloo/claude-usage-tracking` in a browser while logged into GitHub and confirm all files are present.
