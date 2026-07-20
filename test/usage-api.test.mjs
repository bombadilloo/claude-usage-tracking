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
