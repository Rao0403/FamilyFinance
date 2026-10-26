export function nextDue(date: string, frequency: string): string | null {
  if (frequency === "once") return null;
  const d = new Date(`${date}T12:00:00Z`);
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else {
    const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
    const originalDay = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(originalDay, maxDay));
  }
  return d.toISOString().slice(0, 10);
}
