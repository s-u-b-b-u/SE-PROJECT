// Business rules for partial-segment ride participation.
const { eachDay, toUtc } = require('./dates');

/**
 * Per-day seat check. A seat is only occupied on the days a participant rides,
 * so riders on non-overlapping segments can share capacity.
 * @param {number} capacity
 * @param {{join_date:string, leave_date:string}[]} active  current 'joined' participants (dates ISO)
 * @param {string} joinDate
 * @param {string} leaveDate
 * @returns {{ ok: boolean, fullDays: string[], peak: number }}
 */
function checkCapacity(capacity, active, joinDate, leaveDate) {
  const fullDays = [];
  let peak = 0;
  for (const day of eachDay(joinDate, leaveDate)) {
    const t = toUtc(day);
    const riding = active.filter((p) => toUtc(p.join_date) <= t && t <= toUtc(p.leave_date)).length;
    peak = Math.max(peak, riding);
    if (riding >= capacity) fullDays.push(day);
  }
  return { ok: fullDays.length === 0, fullDays, peak };
}

/** Minimum seats free on any day of the ride (for listing badges). */
function seatsLeft(capacity, active, startDate, endDate) {
  return capacity - checkCapacity(Infinity, active, startDate, endDate).peak;
}

/**
 * Validates a requested segment against the ride's ordered stops and dates.
 * @returns {string|null} error message, or null when valid
 */
function validateSegment(ride, stops, joinStopId, leaveStopId, joinDate, leaveDate) {
  const join = stops.find((s) => s.id === joinStopId);
  const leave = stops.find((s) => s.id === leaveStopId);
  if (!join || !leave) return 'Choose stops that belong to this ride.';
  if (leave.stop_order <= join.stop_order) return 'Your leaving stop must come after your joining stop.';
  if (toUtc(leaveDate) < toUtc(joinDate)) return 'Leaving date cannot be before joining date.';
  if (toUtc(joinDate) < toUtc(ride.start_date) || toUtc(leaveDate) > toUtc(ride.end_date)) {
    return 'Your dates must fall within the ride dates.';
  }
  return null;
}

module.exports = { checkCapacity, seatsLeft, validateSegment };
