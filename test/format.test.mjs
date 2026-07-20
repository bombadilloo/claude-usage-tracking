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
