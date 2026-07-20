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
  const time = resetsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (isSameDay) return time;
  const weekday = resetsAt.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = resetsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${weekday} · ${monthDay}, ${time}`;
}
