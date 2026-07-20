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
