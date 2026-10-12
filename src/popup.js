import "./vendor/browser-polyfill.js";
import {
  formatTimeSaved, formatResetIn, formatResetAt, pacePercent, SESSION_WINDOW_MS, WEEK_WINDOW_MS,
} from "./lib/format.js";
import { getSettings, setSetting, getTotalOpens, bumpOpens } from "./lib/synced.js";

const els = {
  loading: document.getElementById("state-loading"),
  claudeSection: document.getElementById("claude-section"),
  claudeLoggedOut: document.getElementById("claude-logged-out"),
  noneNote: document.getElementById("none-note"),
  codexSection: document.getElementById("codex-section"),
  loaded: document.getElementById("state-loaded"),
  staleNote: document.getElementById("stale-note"),
  sessionPct: document.getElementById("session-pct"),
  sessionBar: document.getElementById("session-bar"),
  sessionReset: document.getElementById("session-reset"),
  weekPct: document.getElementById("week-pct"),
  weekBar: document.getElementById("week-bar"),
  weekReset: document.getElementById("week-reset"),
  notifDenied: document.getElementById("notif-denied-note"),
  opensCount: document.getElementById("opens-count"),
  timeSaved: document.getElementById("time-saved"),
  codexLoggedOut: document.getElementById("codex-logged-out"),
  codexError: document.getElementById("codex-error"),
  codexLogin: document.getElementById("codex-login"),
  codexMeters: document.getElementById("codex-meters"),
  codexSessionPct: document.getElementById("codex-session-pct"),
  codexSessionBar: document.getElementById("codex-session-bar"),
  codexSessionReset: document.getElementById("codex-session-reset"),
  codexWeekPct: document.getElementById("codex-week-pct"),
  codexWeekBar: document.getElementById("codex-week-bar"),
  codexWeekReset: document.getElementById("codex-week-reset"),
};

function renderCodex(codex) {
  const ready = Boolean(codex?.loggedIn && codex.session && codex.week);
  els.codexMeters.hidden = !ready;
  els.codexLoggedOut.hidden = ready || !codex?.error;
  els.codexError.textContent = codex?.loggedIn === false ? "" : `Codex error: ${codex?.error ?? ""}`;
  els.codexLogin.hidden = codex?.loggedIn !== false;
  if (!ready) return;
  const now = new Date();
  const fill = (pctEl, barEl, resetEl, win, prefix) => {
    const pct = Math.round(win.pct);
    pctEl.textContent = String(pct);
    barEl.style.width = `${Math.min(100, pct)}%`;
    resetEl.textContent = win.resetsAt ? `${prefix} ${formatResetAt(win.resetsAt, now)}` : "";
  };
  const sessionPrefix = codex.session.resetsAt ? `Resets in ${formatResetIn(codex.session.resetsAt, now)} ·` : "Resets";
  fill(els.codexSessionPct, els.codexSessionBar, els.codexSessionReset, codex.session, sessionPrefix);
  fill(els.codexWeekPct, els.codexWeekBar, els.codexWeekReset, codex.week, "Resets");
  applyPace(els.codexSessionBar, codex.session, SESSION_WINDOW_MS, now);
  applyPace(els.codexWeekBar, codex.week, WEEK_WINDOW_MS, now);
}

const ORIGINS = ["https://claude.ai/*", "https://chatgpt.com/*"];
const permBanner = document.getElementById("perm-banner");

async function checkPermissions() {
  const granted = await browser.permissions.contains({ origins: ORIGINS }).catch(() => true);
  permBanner.hidden = granted;
  return granted;
}

document.getElementById("perm-grant").addEventListener("click", async () => {
  // Must be called directly from the click handler (user gesture).
  const ok = await browser.permissions.request({ origins: ORIGINS });
  if (ok) {
    permBanner.hidden = true;
    browser.runtime.sendMessage({ type: "refresh" }).catch(() => {});
  }
});

// Draws a tick at the even-pace position and flags the bar when usage is ahead of it.
function applyPace(barEl, win, windowMs, now) {
  const track = barEl.parentElement;
  let tick = track.querySelector(".pace-tick");
  const pace = pacePercent(win.resetsAt, windowMs, now);
  if (pace === null) {
    tick?.remove();
    return;
  }
  if (!tick) {
    tick = document.createElement("div");
    tick.className = "pace-tick";
    track.appendChild(tick);
  }
  tick.style.left = `${pace}%`;
  const diff = Math.round(win.pct - pace);
  barEl.classList.toggle("over-pace", diff > 0);
  track.title = diff > 0
    ? `Even pace: ${Math.round(pace)}% — you're ${diff} points ahead`
    : `Even pace: ${Math.round(pace)}% — you're ${-diff} points under`;
}

function setState(name) {
  els.loading.hidden = name !== "loading";
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

  applyPace(els.sessionBar, session, SESSION_WINDOW_MS, now);
  applyPace(els.weekBar, week, WEEK_WINDOW_MS, now);
  els.staleNote.hidden = !stale;
}

function renderSettings(settings, notificationsDenied) {
  for (const btn of document.querySelectorAll("[data-setting]")) {
    const on = settings[btn.dataset.setting] !== false;
    btn.setAttribute("aria-checked", String(on));
    btn.classList.toggle("on", on);
  }
  els.notifDenied.hidden = !notificationsDenied;
}

function renderFooter(opensCount) {
  els.opensCount.textContent = `${opensCount}×`;
  els.timeSaved.textContent = formatTimeSaved(opensCount);
}

async function render() {
  const stored = await browser.storage.local.get([
    "loggedIn", "session", "week", "stale", "notificationsDenied", "codex",
  ]);
  Object.assign(stored, await getSettings());
  const claudeOn = stored.claudeEnabled !== false;
  const codexOn = stored.codexEnabled !== false;
  renderSettings(stored, Boolean(stored.notificationsDenied));
  renderFooter(await getTotalOpens());

  const claudeKnown = stored.loggedIn === false || (stored.session && stored.week);
  const codexKnown = Boolean(stored.codex?.loggedIn || stored.codex?.error);
  if ((claudeOn || codexOn) && (!claudeOn || !claudeKnown) && (!codexOn || !codexKnown)) {
    setState("loading");
    return;
  }

  setState("loaded");
  els.noneNote.hidden = claudeOn || codexOn;
  els.claudeSection.hidden = !claudeOn;
  els.codexSection.hidden = !codexOn;
  els.staleNote.hidden = true;
  if (claudeOn) {
    const claudeOut = stored.loggedIn === false;
    els.claudeLoggedOut.hidden = !claudeOut;
    for (const m of els.claudeSection.querySelectorAll(".meter")) m.hidden = claudeOut || !claudeKnown;
    if (!claudeOut && claudeKnown) renderMeters(stored.session, stored.week, Boolean(stored.stale));
  }
  if (codexOn) renderCodex(stored.codex);
}

async function init() {
  await checkPermissions();
  await bumpOpens();
  await render();
  browser.runtime.sendMessage({ type: "refresh" }).catch(() => {});
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" || area === "sync") render();
});

const menu = document.getElementById("menu");
const menuBtn = document.getElementById("menu-btn");

function setMenuOpen(open) {
  menu.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
}

menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenuOpen(menu.hidden);
});
document.addEventListener("click", (e) => {
  if (!menu.hidden && !menu.contains(e.target)) setMenuOpen(false);
});

menu.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-setting]");
  if (!btn) return;
  const key = btn.dataset.setting;
  const current = (await getSettings())[key] !== false;
  await setSetting(key, !current);
});

init();
