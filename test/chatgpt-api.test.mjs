import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchChatGptAuth, fetchCodexUsage, fetchChatGptUsage } from "../src/lib/chatgpt-api.js";
import { UsageApiError } from "../src/lib/usage-api.js";

function fakeFetch(responses, calls = []) {
  let call = 0;
  return async (url, opts) => {
    calls.push({ url, opts });
    return responses[call++];
  };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const usageBody = {
  rate_limit: {
    primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_at: 1800000000 },
    secondary_window: { used_percent: 34, limit_window_seconds: 604800, reset_at: 1800500000 },
  },
};

test("fetchChatGptAuth returns token and account id", async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, { accessToken: "tok", account: { id: "acc" } })]);
  assert.deepEqual(await fetchChatGptAuth(fetchImpl), { accessToken: "tok", accountId: "acc" });
});

test("fetchChatGptAuth treats a missing token as logged out", async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, {})]);
  await assert.rejects(() => fetchChatGptAuth(fetchImpl), (err) => {
    assert.ok(err instanceof UsageApiError);
    assert.equal(err.status, 401);
    return true;
  });
});

test("fetchCodexUsage maps primary/secondary windows and sends auth headers", async () => {
  const calls = [];
  const fetchImpl = fakeFetch([jsonResponse(200, usageBody)], calls);
  const usage = await fetchCodexUsage({ accessToken: "tok", accountId: "acc" }, fetchImpl);
  assert.deepEqual(usage, {
    session: { pct: 12, resetsAt: new Date(1800000000 * 1000).toISOString() },
    week: { pct: 34, resetsAt: new Date(1800500000 * 1000).toISOString() },
  });
  assert.equal(calls[0].opts.headers.Authorization, "Bearer tok");
  assert.equal(calls[0].opts.headers["ChatGPT-Account-ID"], "acc");
});

test("fetchCodexUsage throws on unexpected shape and on 401", async () => {
  await assert.rejects(
    () => fetchCodexUsage({ accessToken: "t" }, fakeFetch([jsonResponse(200, {})])),
    UsageApiError,
  );
  await assert.rejects(
    () => fetchCodexUsage({ accessToken: "t" }, fakeFetch([jsonResponse(401, {})])),
    (err) => err.status === 401,
  );
});

test("fetchChatGptUsage chains auth and usage", async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, { accessToken: "tok" }), jsonResponse(200, usageBody)]);
  const usage = await fetchChatGptUsage(fetchImpl);
  assert.equal(usage.week.pct, 34);
});
