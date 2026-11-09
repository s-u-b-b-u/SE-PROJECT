// Date helpers. All dates are ISO 'YYYY-MM-DD' strings (calendar days, no time zone).
const DAY_MS = 86400000;

const toUtc = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const isIsoDate = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(toUtc(value)).toISOString().slice(0, 10) === value;

/** Number of shared calendar days between [aStart,aEnd] and [bStart,bEnd] (inclusive). 0 if none. */
function overlapDays(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(toUtc(aStart), toUtc(bStart));
  const end = Math.min(toUtc(aEnd), toUtc(bEnd));
  return end < start ? 0 : Math.round((end - start) / DAY_MS) + 1;
}

/** Every ISO date from start to end inclusive. */
function eachDay(start, end) {
  const out = [];
  for (let t = toUtc(start); t <= toUtc(end); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Normalise a mysql2 DATE value (Date or string) to ISO. */
const iso = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear(), m = String(value.getMonth() + 1).padStart(2, '0'), d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
};

module.exports = { isIsoDate, overlapDays, eachDay, todayIso, iso, toUtc };
