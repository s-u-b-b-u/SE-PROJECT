const { pool, withTransaction } = require('../config/db');
const { HttpError, asyncHandler, toId, str } = require('../utils/http');
const { isIsoDate, todayIso, toUtc } = require('../utils/dates');
const { checkCapacity, seatsLeft, validateSegment } = require('../utils/participation');
const Ride = require('../models/ride-model');
const locations = require('../models/location-model');
const { notify, notifyMany } = require('../models/notification-model');

const EXPENSE_TYPES = ['shared', 'host_sponsored'];

const date = (value, field) => {
  if (!isIsoDate(value)) throw new HttpError(400, `${field} must be a valid date.`);
  return value;
};

/** Validates and normalises ride input. Returns { fields, stops }. */
async function parseRideInput(body, { requireFuture = true } = {}) {
  const title = str(body.title, { min: 4, max: 140, field: 'Title' });
  const description = str(body.description, { min: 10, max: 4000, field: 'Description' });
  const startDate = date(body.startDate, 'Start date');
  const endDate = date(body.endDate, 'End date');
  if (toUtc(endDate) < toUtc(startDate)) throw new HttpError(400, 'End date cannot be before start date.');
  if (requireFuture && toUtc(startDate) < toUtc(todayIso())) throw new HttpError(400, 'Start date cannot be in the past.');
  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) throw new HttpError(400, 'Capacity must be between 1 and 200 riders.');
  const expenseType = EXPENSE_TYPES.includes(body.expenseType) ? body.expenseType : null;
  if (!expenseType) throw new HttpError(400, 'Choose an expense arrangement.');

  const rawStops = Array.isArray(body.stops) ? body.stops : [];
  if (rawStops.length < 2) throw new HttpError(400, 'Add at least a starting point and a destination.');
  if (rawStops.length > 30) throw new HttpError(400, 'A ride can have at most 30 stops.');
  const stops = [];
  for (let i = 0; i < rawStops.length; i++) {
    const label = i === 0 ? 'Starting point' : i === rawStops.length - 1 ? 'Destination' : `Stop ${i + 1}`;
    const loc = await locations.requireValid(rawStops[i].locationId, label);
    if (stops.length && stops.at(-1).locationId === loc.id) throw new HttpError(400, `${label} repeats the previous stop.`);
    let planned = rawStops[i].plannedDate || null;
    if (planned) {
      date(planned, `${label} date`);
      if (toUtc(planned) < toUtc(startDate) || toUtc(planned) > toUtc(endDate)) {
        throw new HttpError(400, `${label} date must be within the ride dates.`);
      }
      if (stops.some((s) => s.plannedDate && toUtc(s.plannedDate) > toUtc(planned))) {
        throw new HttpError(400, `${label} date cannot be earlier than a previous stop.`);
      }
    }
    stops.push({ locationId: loc.id, plannedDate: planned });
  }
  if (!stops[0].plannedDate) stops[0].plannedDate = startDate;
  if (!stops.at(-1).plannedDate) stops.at(-1).plannedDate = endDate;

  return {
    fields: {
      title, description, start_date: startDate, end_date: endDate, capacity,
      is_tentative: Boolean(body.isTentative), expense_type: expenseType,
      expense_note: str(body.expenseNote, { max: 300, field: 'Expense note' }),
      start_location_id: stops[0].locationId, end_location_id: stops.at(-1).locationId,
    },
    stops,
  };
}

async function requireHost(rideId, userId, db = pool, lock = false) {
  const ride = await Ride.findById(rideId, db, lock);
  if (!ride) throw new HttpError(404, 'Ride not found.');
  if (ride.host_id !== userId) throw new HttpError(403, 'Only the host can do this.');
  return ride;
}

// ---------- Listing & detail ----------

exports.list = asyncHandler(async (req, res) => {
  const q = req.query;
  const fromLoc = q.from ? await locations.requireValid(q.from, 'From') : null;
  const toLoc = q.to ? await locations.requireValid(q.to, 'To') : null;
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(q.limit) || 12));
  const result = await Ride.list({
    q: typeof q.q === 'string' ? q.q.trim().slice(0, 80) : '',
    fromLoc, toLoc,
    dateFrom: isIsoDate(q.dateFrom) ? q.dateFrom : null,
    dateTo: isIsoDate(q.dateTo) ? q.dateTo : null,
    expense: EXPENSE_TYPES.includes(q.expense) ? q.expense : null,
    minSeats: Number(q.seats) > 0 ? Number(q.seats) : null,
    sort: q.sort,
    limit, offset: (page - 1) * limit,
  });
  res.json({ ...result, page, limit });
});

exports.mine = asyncHandler(async (req, res) => {
  const [hosted] = await pool.query(`${Ride.CARD_SELECT} WHERE r.host_id = ? ORDER BY r.start_date DESC`, [req.user.id]);
  const [joined] = await pool.query(
    `${Ride.CARD_SELECT} JOIN ride_participants p ON p.ride_id = r.id
     WHERE p.user_id = ? AND p.status = 'joined' ORDER BY r.start_date DESC`,
    [req.user.id]
  );
  res.json({ hosted: await Ride.withSeats(hosted), joined: await Ride.withSeats(joined) });
});

exports.detail = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const [[ride]] = await pool.query(
    `SELECT r.*, h.display_name AS host_name, h.bike_model AS host_bike,
            (SELECT ROUND(AVG(rv.rating),1) FROM reviews rv JOIN rides r2 ON r2.id = rv.ride_id WHERE r2.host_id = r.host_id) AS host_rating
     FROM rides r JOIN users h ON h.id = r.host_id WHERE r.id = ?`,
    [id]
  );
  const viewerId = req.session.userId || null;
  if (!ride || (ride.status === 'draft' && ride.host_id !== viewerId)) throw new HttpError(404, 'Ride not found.');

  const stops = await Ride.stopsFor(id);
  const participants = await Ride.activeParticipants(id);
  const [reviews] = await pool.query(
    `SELECT rv.id, rv.rating, rv.comment, rv.created_at, u.id AS reviewer_id, u.display_name AS reviewer_name
     FROM reviews rv JOIN users u ON u.id = rv.reviewer_id WHERE rv.ride_id = ? ORDER BY rv.created_at DESC`,
    [id]
  );
  const mine = viewerId ? participants.find((p) => p.user_id === viewerId) || null : null;
  const canReview = Boolean(viewerId && mine && ride.status === 'completed' && !reviews.some((r) => r.reviewer_id === viewerId));

  res.json({
    ride: { ...ride, seats_left: seatsLeft(ride.capacity, participants, ride.start_date, ride.end_date) },
    stops,
    participants: ride.host_id === viewerId || mine ? participants : participants.map(({ user_id, display_name, bike_model, join_stop_id, leave_stop_id }) => ({ user_id, display_name, bike_model, join_stop_id, leave_stop_id })),
    reviews,
    viewer: { isHost: ride.host_id === viewerId, participation: mine, canReview, loggedIn: Boolean(viewerId) },
  });
});

// ---------- Hosting ----------

exports.create = asyncHandler(async (req, res) => {
  const { fields, stops } = await parseRideInput(req.body);
  const status = req.body.status === 'draft' ? 'draft' : 'published';
  const rideId = await withTransaction(async (db) => {
    const [r] = await db.query('INSERT INTO rides SET ?', [{ ...fields, host_id: req.user.id, status }]);
    await db.query('INSERT INTO ride_stops (ride_id, location_id, stop_order, planned_date) VALUES ?', [
      stops.map((s, i) => [r.insertId, s.locationId, i, s.plannedDate]),
    ]);
    return r.insertId;
  });
  res.status(201).json({ id: rideId });
});

exports.update = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const notifyIds = await withTransaction(async (db) => {
    const ride = await requireHost(id, req.user.id, db, true);
    if (!['draft', 'published'].includes(ride.status)) throw new HttpError(400, 'Only upcoming rides can be edited.');
    const { fields, stops } = await parseRideInput(req.body, { requireFuture: false });
    const participants = await Ride.activeParticipants(id, db);

    // Stops can only be restructured while nobody has joined.
    const currentStops = await Ride.stopsFor(id, db);
    const sameRoute = currentStops.length === stops.length && currentStops.every((s, i) => s.location_id === stops[i].locationId);
    if (!sameRoute && participants.length) throw new HttpError(409, 'The route cannot be changed after riders have joined. Remove participants first or create a new ride.');
    for (const p of participants) {
      if (toUtc(p.join_date) < toUtc(fields.start_date) || toUtc(p.leave_date) > toUtc(fields.end_date)) {
        throw new HttpError(409, `New dates exclude ${p.display_name}'s booked days.`);
      }
    }
    const peak = checkCapacity(Infinity, participants, fields.start_date, fields.end_date).peak;
    if (fields.capacity < peak) throw new HttpError(409, `Capacity cannot be below ${peak}, the number already riding on the busiest day.`);

    const status = ride.status === 'draft' && req.body.status === 'published' ? 'published' : ride.status;
    await db.query('UPDATE rides SET ? WHERE id = ?', [{ ...fields, status }, id]);
    if (sameRoute) {
      for (let i = 0; i < stops.length; i++) {
        await db.query('UPDATE ride_stops SET planned_date = ? WHERE id = ?', [stops[i].plannedDate, currentStops[i].id]);
      }
    } else {
      await db.query('DELETE FROM ride_stops WHERE ride_id = ?', [id]);
      await db.query('INSERT INTO ride_stops (ride_id, location_id, stop_order, planned_date) VALUES ?', [
        stops.map((s, i) => [id, s.locationId, i, s.plannedDate]),
      ]);
    }
    return participants.map((p) => p.user_id);
  });
  await notifyMany(notifyIds, 'ride_updated', { rideId: id, title: req.body.title });
  res.json({ ok: true });
});

const changeStatus = (to) => asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const ride = await requireHost(id, req.user.id);
  if (to === 'cancelled' && !['draft', 'published'].includes(ride.status)) throw new HttpError(400, 'This ride can no longer be cancelled.');
  if (to === 'completed') {
    if (ride.status !== 'published') throw new HttpError(400, 'Only published rides can be completed.');
    if (toUtc(ride.start_date) > toUtc(todayIso())) throw new HttpError(400, 'A ride can be marked completed only after it starts.');
  }
  await pool.query('UPDATE rides SET status = ? WHERE id = ?', [to, id]);
  const participants = await Ride.activeParticipants(id);
  await notifyMany(participants.map((p) => p.user_id), to === 'cancelled' ? 'ride_cancelled' : 'ride_completed', { rideId: id, title: ride.title });
  res.json({ ok: true });
});
exports.cancel = changeStatus('cancelled');
exports.complete = changeStatus('completed');

// ---------- Participation ----------

exports.join = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const result = await withTransaction(async (db) => {
    const ride = await Ride.findById(id, db, true); // row lock serialises concurrent joins
    if (!ride || ride.status !== 'published') throw new HttpError(404, 'This ride is not open for joining.');
    if (ride.host_id === req.user.id) throw new HttpError(400, 'You are hosting this ride.');
    if (toUtc(ride.end_date) < toUtc(todayIso())) throw new HttpError(400, 'This ride has already ended.');

    const stops = await Ride.stopsFor(id, db);
    const joinStopId = Number(req.body.joinStopId) || stops[0].id;
    const leaveStopId = Number(req.body.leaveStopId) || stops.at(-1).id;
    const joinDate = req.body.joinDate || ride.start_date;
    const leaveDate = req.body.leaveDate || ride.end_date;
    if (!isIsoDate(joinDate) || !isIsoDate(leaveDate)) throw new HttpError(400, 'Choose valid dates.');
    const segmentError = validateSegment(ride, stops, joinStopId, leaveStopId, joinDate, leaveDate);
    if (segmentError) throw new HttpError(400, segmentError);

    const [[existing]] = await db.query('SELECT id, status FROM ride_participants WHERE ride_id = ? AND user_id = ?', [id, req.user.id]);
    if (existing?.status === 'joined') throw new HttpError(409, 'You have already joined this ride.');
    if (existing?.status === 'removed') throw new HttpError(403, 'The host has removed you from this ride.');

    const participants = await Ride.activeParticipants(id, db);
    const cap = checkCapacity(ride.capacity, participants, joinDate, leaveDate);
    if (!cap.ok) throw new HttpError(409, `No seats left on ${cap.fullDays.slice(0, 3).join(', ')}${cap.fullDays.length > 3 ? '…' : ''}. Try different dates.`, { fullDays: cap.fullDays });

    const row = { join_stop_id: joinStopId, leave_stop_id: leaveStopId, join_date: joinDate, leave_date: leaveDate, status: 'joined' };
    if (existing) await db.query('UPDATE ride_participants SET ? WHERE id = ?', [row, existing.id]);
    else await db.query('INSERT INTO ride_participants SET ?', [{ ...row, ride_id: id, user_id: req.user.id }]);

    const from = stops.find((s) => s.id === joinStopId).name;
    const to = stops.find((s) => s.id === leaveStopId).name;
    await notify(ride.host_id, 'ride_joined', { rideId: id, title: ride.title, userId: req.user.id, name: req.user.display_name, from, to }, db);
    return { from, to };
  });
  res.status(201).json({ ok: true, ...result });
});

exports.leave = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const ride = await Ride.findById(id);
  if (!ride) throw new HttpError(404, 'Ride not found.');
  const [r] = await pool.query(
    `UPDATE ride_participants SET status = 'left' WHERE ride_id = ? AND user_id = ? AND status = 'joined'`,
    [id, req.user.id]
  );
  if (!r.affectedRows) throw new HttpError(404, 'You are not part of this ride.');
  await notify(ride.host_id, 'ride_left', { rideId: id, title: ride.title, name: req.user.display_name });
  res.json({ ok: true });
});

exports.removeParticipant = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const userId = toId(req.params.userId);
  const ride = await requireHost(id, req.user.id);
  const [r] = await pool.query(
    `UPDATE ride_participants SET status = 'removed' WHERE ride_id = ? AND user_id = ? AND status = 'joined'`,
    [id, userId]
  );
  if (!r.affectedRows) throw new HttpError(404, 'Participant not found.');
  await notify(userId, 'participant_removed', { rideId: id, title: ride.title });
  res.json({ ok: true });
});

// ---------- Reviews ----------

exports.review = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const ride = await Ride.findById(id);
  if (!ride) throw new HttpError(404, 'Ride not found.');
  if (ride.status !== 'completed') throw new HttpError(400, 'Reviews open once the host marks the ride completed.');
  const [[p]] = await pool.query(`SELECT id FROM ride_participants WHERE ride_id = ? AND user_id = ? AND status = 'joined'`, [id, req.user.id]);
  if (!p) throw new HttpError(403, 'Only riders who took part can review this ride.');
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Rating must be 1 to 5.');
  await pool.query('INSERT INTO reviews (ride_id, reviewer_id, rating, comment) VALUES (?,?,?,?)', [
    id, req.user.id, rating, str(req.body.comment, { max: 1000, field: 'Comment' }),
  ]);
  await notify(ride.host_id, 'review', { rideId: id, title: ride.title, rating, name: req.user.display_name });
  res.status(201).json({ ok: true });
});
