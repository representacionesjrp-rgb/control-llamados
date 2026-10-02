// Day boundaries in the business timezone, so "hoy" means today in Chile and not in UTC.

function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Epoch ms of local midnight starting the given YYYY-MM-DD in timeZone. */
export function startOfDay(date: string, timeZone: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  let guess = utcMidnight - offsetMs(utcMidnight, timeZone);
  guess = utcMidnight - offsetMs(guess, timeZone);
  return guess;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function today(timeZone: string, now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** [from, to) in epoch ms covering both dates inclusive. */
export function dateRange(from: string, to: string, timeZone: string): [number, number] {
  return [startOfDay(from, timeZone), startOfDay(addDays(to, 1), timeZone)];
}
