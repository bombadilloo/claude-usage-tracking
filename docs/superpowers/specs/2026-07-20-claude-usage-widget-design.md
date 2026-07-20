# Claude Usage Widget — Design

## Overview

A Chrome/Firefox browser extension that shows a user's Claude.ai usage without
opening claude.ai. Popup shows:

- Session (5-hour) and weekly (7-day) usage percentage, plus when each resets
- A toggle for desktop notifications when a limit resets
- A running counter of how many times the popup has been opened, and time
  saved (opens × 9s, the time it normally takes to open claude.ai and check
  usage manually)
- A Ko-fi donation button

A visual mockup already exists at
`Claude usage widget/Claude Usage Widget.dc.html` and is the source of truth
for layout, colors, and copy. This spec covers the extension that makes that
mockup's data real.

## Data source

Claude.ai's own web app is backed by an internal (undocumented, not part of
the public Anthropic API) endpoint:

- `GET https://claude.ai/api/organizations` → list of orgs the logged-in user
  belongs to; take `[0].uuid` as the active org id.
- `GET https://claude.ai/api/organizations/{orgId}/usage` → returns at least
  `five_hour: {utilization, resets_at}` and `seven_day: {utilization,
  resets_at}` (a `seven_day_opus` field may also be present on some plans —
  ignored for v1, out of scope).

No API key or login flow is implemented by the extension. A background
script with `host_permissions` for `https://claude.ai/*` calls these
endpoints with `credentials: 'include'`; the browser attaches the user's
existing claude.ai session cookie automatically.

**Hard constraint:** the user must already be logged into claude.ai in that
browser profile. If they aren't, calls return 401/redirect-to-login and the
popup shows a "Log in to claude.ai to see usage" state instead of meters.

**Fragility:** this endpoint is not a stable public contract. It can change
without notice. This is accepted as the only viable approach (validated by
several existing open-source extensions using the same endpoint) — there is
no official API for personal claude.ai usage limits.

## Architecture

No build framework/bundler — plain HTML/CSS/JS, small enough that a
bundler would be pure overhead.

```
claude-usage-widget/
├── src/
│   ├── manifest.chrome.json    # MV3, background.service_worker
│   ├── manifest.firefox.json   # MV3, background.scripts[] + browser_specific_settings.gecko.id
│   ├── background.js           # polling, alarm scheduling, notifications
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   ├── vendor/browser-polyfill.js   # webextension-polyfill, vendored (no CDN)
│   └── icons/
│       ├── icon16.png / icon32.png / icon48.png / icon128.png
├── scripts/
│   ├── generate-icons.mjs      # pure-JS (pngjs) rasterizer, no native deps
│   ├── validate-manifests.mjs  # parses both manifests, checks required keys
│   └── build.mjs               # assembles src + correct manifest → dist/chrome, dist/firefox (zipped)
├── docs/superpowers/specs/
├── README.md
└── LICENSE
```

Both manifests point at the same `src/` files; only the manifest itself and
the `background` key's shape differ between Chrome and Firefox MV3. Code
uses the `browser.*` promise API (via the polyfill) everywhere so
`background.js`/`popup.js` are unmodified across both targets.

Permissions requested: `storage`, `alarms`, `notifications`, and
`host_permissions: ["https://claude.ai/*"]`. Nothing broader (no `<all_urls>`,
no `tabs`).

## Data flow

1. **Polling.** `chrome.alarms` fires every 5 minutes. Handler: resolve org
   id (cached after first success) → fetch `/usage` → on success, write
   `{ session: {pct, resetsAt}, week: {pct, resetsAt}, lastUpdated,
   loggedIn: true }` to `storage.local`. On auth failure, write
   `{ loggedIn: false }`. On network failure, leave last-known data in place
   and just update a `stale: true` flag.
2. **Popup open.** On load: increment `opensCount` in `storage.local`,
   render whatever's cached immediately (instant, no spinner-first UX), then
   kick an immediate background refresh and re-render when it resolves.
3. **Time saved.** Derived value, not stored: `opensCount * 9` seconds,
   formatted the way the mockup shows it (`"46 min"` — minutes once ≥60s,
   otherwise seconds).
4. **Notifications.** Toggle state stored in `storage.local`. When ON,
   background schedules a one-shot alarm for `min(session.resetsAt,
   week.resetsAt)`. On fire: `notifications.create(...)`, then reschedule
   for whichever is next. Every poll cycle re-evaluates and reschedules
   (resets_at can shift as the user keeps using Claude). Toggle OFF clears
   any pending reset alarm. If the `notifications` permission is denied by
   the browser, the toggle still flips and persists but is a silent no-op —
   a small inline note explains why.
5. **Donate button.** Static `<a>` to the Ko-fi URL already in the mockup —
   no logic.

## UI

Popup markup/styling is a direct port of the mockup's "standalone popup"
block (`Claude Usage Widget.dc.html` lines 145–215): 356px wide, same
fonts (Newsreader for numbers, Hanken Grotesk for text), same colors,
same two meters + toggle + footer stat + Ko-fi button. The mockup's
`planLabel` ("Claude Pro · resets shown local") is simplified to a static
"Resets shown in your local time" — the usage endpoint doesn't reliably
expose a human plan name, and guessing it from `rate_limit_tier` values is
too fragile to build on.

## Error / edge cases

| Case | Behavior |
|---|---|
| Not logged into claude.ai | Popup shows "Log in to claude.ai to see your usage" with a link, no meters |
| Network/API failure | Show last-known cached values with a small "stale" marker; retry next alarm |
| `notifications` permission denied | Toggle persists but no-ops, inline note shown |
| Org id fetch fails | Treated same as not-logged-in state |
| First-ever open, no cache yet | Meters show a lightweight loading state until first fetch resolves |

## Testing

Manual, cross-browser — this is a thin UI over a single external call, not
worth a test framework:

- Chrome: `chrome://extensions` → load unpacked (`dist/chrome` or `src/` +
  `manifest.chrome.json`)
- Firefox: `about:debugging#/runtime/this-firefox` → load temporary add-on
- Verify: meters render real percentages, resets format correctly, toggle
  persists across popup close/reopen, opens-counter increments, notification
  fires when a reset alarm is simulated with a near-future time, Ko-fi link
  opens correctly, logged-out state renders correctly (test in a private
  window with no claude.ai session)

`scripts/validate-manifests.mjs` is a small automated guard (run in CI/
pre-commit-ish, not a full test suite): both manifest JSONs parse, and
required keys (`manifest_version`, `permissions`, `host_permissions`,
`background`) are present, so a bad edit fails fast without needing a
browser.

## Repo / distribution

- Private GitHub repo: `bombadilloo/claude-usage-tracking` (already
  created by the user).
- `scripts/build.mjs` zips `dist/chrome.zip` and `dist/firefox.zip` for
  manual sideloading / future store submission — store listing/publishing
  itself is out of scope for this pass.
- Icons generated at build time by `scripts/generate-icons.mjs` (pure JS via
  `pngjs`, no native/system image tools required) — a flat rounded square in
  the mockup's `#D97757` orange.

## Out of scope (v1)

- Opus-specific weekly limit meter (`seven_day_opus`) — add later if a
  Max-plan user asks for it.
- Configurable poll interval — hardcoded 5 minutes.
- Toolbar badge showing live percentage.
- Chrome Web Store / AMO store listing and submission.
- Multi-org support (always uses org `[0]`).
