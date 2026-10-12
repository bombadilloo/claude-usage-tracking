// Settings and the open counter live in browser.storage.sync so they follow the
// browser account. Falls back to storage.local if sync is unavailable.
const SETTING_KEYS = ["notificationsOn", "claudeEnabled", "codexEnabled"];
const OPENS_PREFIX = "opens_";

function syncArea() {
  return browser.storage.sync ?? browser.storage.local;
}

export async function getSettings() {
  return syncArea().get(SETTING_KEYS);
}

export async function setSetting(key, value) {
  await syncArea().set({ [key]: value });
}

// Each device writes only its own counter key, so concurrent syncs never overwrite each other.
export function sumOpens(all) {
  return Object.entries(all)
    .filter(([key, value]) => key.startsWith(OPENS_PREFIX) && Number.isFinite(value))
    .reduce((total, [, value]) => total + value, 0);
}

export async function getTotalOpens() {
  return sumOpens(await syncArea().get(null));
}

export async function bumpOpens() {
  let { deviceId, opensCount } = await browser.storage.local.get(["deviceId", "opensCount"]);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await browser.storage.local.set({ deviceId });
  }
  const key = `${OPENS_PREFIX}${deviceId}`;
  // Seed from the pre-sync local counter so existing history isn't lost.
  const current = (await syncArea().get(key))[key] ?? opensCount ?? 0;
  await syncArea().set({ [key]: current + 1 });
}
