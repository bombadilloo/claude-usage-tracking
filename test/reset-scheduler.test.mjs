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
