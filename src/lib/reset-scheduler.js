export function nextResetAlarm(usage, now = new Date()) {
  const nowMs = now.getTime();
  const candidates = [];
  if (usage?.session?.resetsAt) candidates.push(new Date(usage.session.resetsAt).getTime());
  if (usage?.week?.resetsAt) candidates.push(new Date(usage.week.resetsAt).getTime());

  const future = candidates.filter((ms) => ms > nowMs);
  if (future.length === 0) return null;
  return new Date(Math.min(...future)).toISOString();
}
