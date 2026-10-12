import { UsageApiError } from "./usage-api.js";

const BASE_URL = "https://chatgpt.com";

function assertAuthOk(res, what) {
  if (res.status === 401 || res.status === 403) {
    throw new UsageApiError("Not logged into chatgpt.com", { status: res.status });
  }
  if (!res.ok) {
    throw new UsageApiError(`Failed to ${what} (${res.status})`, { status: res.status });
  }
}

// Exchanges the chatgpt.com session cookie for a short-lived bearer token.
export async function fetchChatGptAuth(fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE_URL}/api/auth/session`, { credentials: "include" });
  assertAuthOk(res, "read session");
  const data = await res.json();
  if (!data?.accessToken) {
    throw new UsageApiError("Not logged into chatgpt.com", { status: 401 });
  }
  return { accessToken: data.accessToken, accountId: data.account?.id ?? null };
}

function mapWindow(win) {
  let resetsAt = null;
  if (typeof win.reset_at === "number") {
    resetsAt = new Date(win.reset_at * 1000).toISOString();
  } else if (typeof win.reset_after_seconds === "number") {
    resetsAt = new Date(Date.now() + win.reset_after_seconds * 1000).toISOString();
  }
  return { pct: win.used_percent, resetsAt };
}

export async function fetchCodexUsage({ accessToken, accountId }, fetchImpl = fetch) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (accountId) headers["ChatGPT-Account-ID"] = accountId;
  const res = await fetchImpl(`${BASE_URL}/backend-api/wham/usage`, { credentials: "include", headers });
  assertAuthOk(res, "fetch Codex usage");
  const data = await res.json();
  const primary = data?.rate_limit?.primary_window;
  const secondary = data?.rate_limit?.secondary_window;
  if (!primary || !secondary) {
    throw new UsageApiError("Unexpected Codex usage response shape");
  }
  return { session: mapWindow(primary), week: mapWindow(secondary) };
}

export async function fetchChatGptUsage(fetchImpl = fetch) {
  const auth = await fetchChatGptAuth(fetchImpl);
  return fetchCodexUsage(auth, fetchImpl);
}
