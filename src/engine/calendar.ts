// Game calendar: 10 trading days Mon 1 Apr - Fri 12 Apr 2024 (weekdays).
// Dates are ISO strings 'YYYY-MM-DD' to keep the engine timezone-free.

export const TRADING_DAYS: string[] = [
  '2024-04-01', '2024-04-02', '2024-04-03', '2024-04-04', '2024-04-05',
  '2024-04-08', '2024-04-09', '2024-04-10', '2024-04-11', '2024-04-12',
];

const DAY_MS = 24 * 3600 * 1000;

export function parseDay(iso: string): Date {
  return new Date(iso + 'T12:00:00Z');
}
export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function dayOfWeek(iso: string): number {
  return parseDay(iso).getUTCDay(); // 0 Sun .. 6 Sat
}
export function isBusinessDay(iso: string): boolean {
  const w = dayOfWeek(iso);
  return w >= 1 && w <= 5;
}
export function addDays(iso: string, n: number): string {
  return toIso(new Date(parseDay(iso).getTime() + n * DAY_MS));
}

/** Offset by n business days (n may be negative). */
export function businessDayOffset(iso: string, n: number): string {
  let cur = iso;
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    cur = addDays(cur, step);
    if (isBusinessDay(cur)) remaining--;
  }
  return cur;
}

export type PricingRule =
  | { kind: 'around'; before: number; after: number }
  | { kind: 'after'; days: number }
  | { kind: 'before'; days: number };

/** Business-day pricing days for a rule around/relative to a B/L date. Sorted ISO. */
export function pricingDaysFor(blDate: string, rule: PricingRule): string[] {
  let days: string[] = [];
  if (rule.kind === 'around') {
    for (let i = rule.before; i >= 1; i--) days.push(businessDayOffset(blDate, -i));
    days.push(blDate);
    for (let i = 1; i <= rule.after; i++) days.push(businessDayOffset(blDate, i));
  } else if (rule.kind === 'after') {
    for (let i = 1; i <= rule.days; i++) days.push(businessDayOffset(blDate, i));
  } else {
    for (let i = rule.days; i >= 1; i--) days.push(businessDayOffset(blDate, -i));
  }
  days = [...new Set(days)].sort();
  return days;
}

/** "2-1-2 around B/L". Fri 5 Apr -> [3,4,5,8,9]; Mon 8 Apr -> [4,5,8,9,10]. */
export function pricingWindow(blDate: string): string[] {
  return pricingDaysFor(blDate, { kind: 'around', before: 2, after: 2 });
}

export function describeRule(rule: PricingRule): string {
  if (rule.kind === 'around') return `${rule.before}-1-${rule.after} around B/L`;
  if (rule.kind === 'after') return `${rule.days} days after B/L`;
  return `${rule.days} days before B/L`;
}

export const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const MONTH_LABELS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/** "MON 1 APR" */
export function formatGameDate(iso: string): string {
  const d = parseDay(iso);
  return `${DAY_LABELS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}`;
}
/** "1 APR" */
export function formatShortDate(iso: string): string {
  const d = parseDay(iso);
  return `${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}`;
}
