import { test } from "node:test";
import assert from "node:assert/strict";
import { sumOpens } from "../src/lib/synced.js";

test("sumOpens adds every device counter and ignores other keys", () => {
  assert.equal(sumOpens({ opens_a: 3, opens_b: 4, notificationsOn: true, opens_c: "x" }), 7);
  assert.equal(sumOpens({}), 0);
});
