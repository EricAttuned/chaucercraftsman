// Dates are plain "YYYY-MM-DD" strings, handled in UTC so there are no
// daylight-saving surprises. A stay occupies the nights [checkIn, checkOut).

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(s) {
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

export function fmt(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function nightsBetween(checkIn, checkOut) {
  return Math.round((parseDate(checkOut) - parseDate(checkIn)) / 86400000);
}

// Every night in [checkIn, checkOut) as a YYYY-MM-DD string.
export function eachNight(checkIn, checkOut) {
  const out = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}

// Today's date in the listing's timezone.
export function todayIn(timezone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}
