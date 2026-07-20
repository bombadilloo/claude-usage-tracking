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
