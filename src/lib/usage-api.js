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
