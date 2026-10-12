export function formatTimeSaved(opensCount, secondsPerOpen = 9) {
  const totalSeconds = opensCount * secondsPerOpen;
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function formatResetIn(resetsAtIso, now = new Date()) {
  const resetsAt = new Date(resetsAtIso);
  const diffMs = resetsAt.getTime() - now.getTime();
  if (diffMs <= 0) return "now";
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatResetAt(resetsAtIso, now = new Date()) {
  const resetsAt = new Date(resetsAtIso);
  const isSameDay = resetsAt.toDateString() === now.toDateString();
  const time = resetsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (isSameDay) return time;
  const weekday = resetsAt.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = resetsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${weekday} · ${monthDay}, ${time}`;
}

export const SESSION_WINDOW_MS = 5 * 60 * 60 * 1000;
export const WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Percent of the window already elapsed (= usage level at an even pace), clamped to 0-100.
export function pacePercent(resetsAtIso, windowMs, now = new Date()) {
  if (!resetsAtIso) return null;
  const remaining = new Date(resetsAtIso).getTime() - now.getTime();
  const elapsed = 1 - remaining / windowMs;
  return Math.min(100, Math.max(0, elapsed * 100));
}
