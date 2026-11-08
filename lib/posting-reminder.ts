const hourMs = 60 * 60 * 1000;

export function reminderDueAt(postedAt: string, now: number) {
  const posted = new Date(postedAt);
  const due = new Date(posted.getTime() + hourMs);
  const cutoff = new Date(posted);
  cutoff.setHours(20, 0, 0, 0);

  if (posted.getHours() < 7 || due >= cutoff || now >= cutoff.getTime()) return null;
  return due.getTime();
}
