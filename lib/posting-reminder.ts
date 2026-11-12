export const REMINDER_TIME_ZONE = "America/New_York";
export const DEFAULT_REMINDER_TIMES = [
  "07:30", "08:30", "09:30", "10:30", "11:30", "12:45", "14:15",
  "15:45", "17:15", "19:20", "20:00", "20:40", "21:30",
];

export function normalizeReminderTimes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 48 ||
      value.some((time) => typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return null;
  return [...new Set(value as string[])].sort();
}

export function nextReminderLabel(times: string[], now: number) {
  if (!times.length) return "No reminders scheduled";
  const current = new Intl.DateTimeFormat("en-GB", {
    timeZone: REMINDER_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(now);
  const next = times.find((time) => time > current);
  const [hour, minute] = (next ?? times[0]).split(":").map(Number);
  return `Next reminder ${next ? "today" : "tomorrow"} at ${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"} ET`;
}
