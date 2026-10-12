import "./vendor/browser-polyfill.js";
import { fetchOrgId, fetchUsage, UsageApiError } from "./lib/usage-api.js";
import { fetchChatGptUsage } from "./lib/chatgpt-api.js";
import { getSettings } from "./lib/synced.js";
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

async function scheduleResetNotification() {
  const { notificationsOn, claudeEnabled, codexEnabled } = await getSettings();
  if (notificationsOn === false) {
    await browser.alarms.clear(RESET_ALARM);
    return;
  }
  const stored = await browser.storage.local.get(["session", "week", "codex"]);
  const nexts = [
    claudeEnabled !== false ? nextResetAlarm(stored) : null,
    codexEnabled !== false && stored.codex?.loggedIn !== false ? nextResetAlarm(stored.codex) : null,
  ].filter(Boolean);
  const next = nexts.sort()[0];
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
    await scheduleResetNotification();
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

async function pollCodex() {
  try {
    const usage = await fetchChatGptUsage();
    await browser.storage.local.set({ codex: { loggedIn: true, stale: false, ...usage } });
    await scheduleResetNotification();
  } catch (err) {
    const { codex } = await browser.storage.local.get("codex");
    const isAuthError = err instanceof UsageApiError && (err.status === 401 || err.status === 403);
    if (isAuthError) {
      await browser.storage.local.set({ codex: { loggedIn: false, error: String(err.message) } });
      await scheduleResetNotification();
      return;
    }
    if (codex?.loggedIn) await browser.storage.local.set({ codex: { ...codex, stale: true } });
    else await browser.storage.local.set({ codex: { error: String(err?.message ?? err) } });
    console.error("Codex poll failed", err);
  }
}

async function pollAll() {
  const { claudeEnabled, codexEnabled } = await getSettings();
  const polls = [];
  if (claudeEnabled !== false) polls.push(pollUsage());
  if (codexEnabled !== false) polls.push(pollCodex());
  await Promise.all(polls);
  if (polls.length < 2) await scheduleResetNotification();
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
    title: "Usage limit reset",
    message: "Your session or weekly usage limit just refreshed.",
  });
}

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLL_ALARM) {
    await pollAll();
  } else if (alarm.name === RESET_ALARM) {
    await fireResetNotification();
    await pollAll();
  }
});

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync" && area !== "local") return;
  if (changes.claudeEnabled?.newValue === true || changes.codexEnabled?.newValue === true) {
    await pollAll();
  } else if (changes.notificationsOn || changes.claudeEnabled || changes.codexEnabled) {
    await scheduleResetNotification();
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "refresh") {
    pollAll();
  }
});

browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MINUTES });
  pollAll();
});

browser.runtime.onStartup.addListener(() => {
  pollAll();
});
