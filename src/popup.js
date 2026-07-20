import "./vendor/browser-polyfill.js";
import { formatTimeSaved, formatResetIn, formatResetAt } from "./lib/format.js";

const els = {
  loading: document.getElementById("state-loading"),
  loggedOut: document.getElementById("state-logged-out"),
  loaded: document.getElementById("state-loaded"),
  staleNote: document.getElementById("stale-note"),
  sessionPct: document.getElementById("session-pct"),
  sessionBar: document.getElementById("session-bar"),
  sessionReset: document.getElementById("session-reset"),
  weekPct: document.getElementById("week-pct"),
  weekBar: document.getElementById("week-bar"),
  weekReset: document.getElementById("week-reset"),
  notifToggle: document.getElementById("notif-toggle"),
  notifDenied: document.getElementById("notif-denied-note"),
  opensCount: document.getElementById("opens-count"),
  timeSaved: document.getElementById("time-saved"),
};

function setState(name) {
  els.loading.hidden = name !== "loading";
  els.loggedOut.hidden = name !== "logged-out";
  els.loaded.hidden = name !== "loaded";
}

function renderMeters(session, week, stale) {
  const now = new Date();
  const sessionPct = Math.round(session.pct);
  els.sessionPct.textContent = String(sessionPct);
  els.sessionBar.style.width = `${Math.min(100, sessionPct)}%`;
  els.sessionReset.textContent = `Resets in ${formatResetIn(session.resetsAt, now)} · ${formatResetAt(session.resetsAt, now)}`;

  const weekPct = Math.round(week.pct);
  els.weekPct.textContent = String(weekPct);
  els.weekBar.style.width = `${Math.min(100, weekPct)}%`;
  els.weekReset.textContent = `Resets ${formatResetAt(week.resetsAt, now)}`;

  els.staleNote.hidden = !stale;
}

function renderNotifToggle(notificationsOn, notificationsDenied) {
  els.notifToggle.setAttribute("aria-checked", String(notificationsOn));
  els.notifToggle.classList.toggle("on", notificationsOn);
  els.notifDenied.hidden = !notificationsDenied;
}

function renderFooter(opensCount) {
  els.opensCount.textContent = `${opensCount}×`;
  els.timeSaved.textContent = formatTimeSaved(opensCount);
}

async function bumpOpensCount() {
  const { opensCount = 0 } = await browser.storage.local.get("opensCount");
  const next = opensCount + 1;
  await browser.storage.local.set({ opensCount: next });
  return next;
}

async function render() {
  const stored = await browser.storage.local.get([
    "loggedIn", "session", "week", "stale", "notificationsOn", "notificationsDenied", "opensCount",
  ]);

  if (stored.loggedIn === false) {
    setState("logged-out");
    return;
  }
  if (!stored.session || !stored.week) {
    setState("loading");
    return;
  }

  setState("loaded");
  renderMeters(stored.session, stored.week, Boolean(stored.stale));
  renderNotifToggle(stored.notificationsOn !== false, Boolean(stored.notificationsDenied));
  renderFooter(stored.opensCount ?? 0);
}

async function init() {
  await bumpOpensCount();
  await render();
  browser.runtime.sendMessage({ type: "refresh" }).catch(() => {});
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local") render();
});

els.notifToggle.addEventListener("click", async () => {
  const { notificationsOn } = await browser.storage.local.get("notificationsOn");
  const currentlyOn = notificationsOn !== false;
  await browser.storage.local.set({ notificationsOn: !currentlyOn });
});

init();
