export const SCHEDULE_START_HOUR = 7;
export const SCHEDULE_END_HOUR = 19;
export const SCHEDULE_HOURS = Array.from(
  { length: SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1 },
  (_, index) => SCHEDULE_START_HOUR + index,
);

export type PostingGroup = {
  id: string;
  name: string;
  slug: string;
  accent: "amber" | "blue" | "emerald" | "violet" | "rose";
  sort_order: number;
};

export type ScheduleStatus = "planned" | "posted";

export type ScheduleItem = {
  id: string;
  posting_group_id: string;
  schedule_date: string;
  schedule_hour: number;
  post_body: string;
  comment_text: string;
  asin: string | null;
  status: ScheduleStatus;
  posted_at: string | null;
  updated_at: string;
};

export type ScheduleDay = {
  groups: PostingGroup[];
  items: ScheduleItem[];
};

export function isScheduleDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateInEasternTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatScheduleHour(hour: number) {
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}
