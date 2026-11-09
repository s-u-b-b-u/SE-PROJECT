const { pool } = require('../config/db');
const { HttpError, asyncHandler, toId, str } = require('../utils/http');
const { isIsoDate, todayIso, toUtc } = require('../utils/dates');
const locations = require('../models/location-model');
const Trip = require('../models/trip-model');

async function parseTrip(body) {
  const origin = await locations.requireValid(body.originLocationId, 'Starting point');
  const destination = await locations.requireValid(body.destinationLocationId, 'Destination');
  if (origin.id === destination.id) throw new HttpError(400, 'Destination must differ from the starting point.');
  if (!isIsoDate(body.startDate) || !isIsoDate(body.endDate)) throw new HttpError(400, 'Choose valid start and end dates.');
  if (toUtc(body.endDate) < toUtc(body.startDate)) throw new HttpError(400, 'End date cannot be before start date.');
  if (toUtc(body.endDate) < toUtc(todayIso())) throw new HttpError(400, 'The trip cannot end in the past.');
  return {
    origin_location_id: origin.id,
    destination_location_id: destination.id,
    start_date: body.startDate,
    end_date: body.endDate,
    notes: str(body.notes, { max: 600, field: 'Notes' }),
  };
}

async function requireOwner(id, userId) {
  const trip = await Trip.findById(id);
  if (!trip) throw new HttpError(404, 'Trip not found.');
  if (trip.user_id !== userId) throw new HttpError(403, 'This is not your trip.');
  return trip;
}

exports.mine = asyncHandler(async (req, res) => {
  res.json({ trips: await Trip.listForUser(req.user.id), rules: Trip.RULES });
});

exports.create = asyncHandler(async (req, res) => {
  const fields = await parseTrip(req.body);
  const [r] = await pool.query('INSERT INTO trips SET ?', [{ ...fields, user_id: req.user.id }]);
  res.status(201).json({ id: r.insertId });
});

exports.update = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  await requireOwner(id, req.user.id);
  const fields = await parseTrip(req.body);
  await pool.query('UPDATE trips SET ? WHERE id = ?', [fields, id]);
  res.json({ ok: true });
});

exports.close = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  await requireOwner(id, req.user.id);
  await pool.query(`UPDATE trips SET status = 'closed' WHERE id = ?`, [id]);
  res.json({ ok: true });
});

exports.matches = asyncHandler(async (req, res) => {
  const trip = await requireOwner(toId(req.params.id), req.user.id);
  if (trip.status !== 'active') return res.json({ trip, matches: [], rules: Trip.RULES });
  res.json({ trip, matches: await Trip.findMatches(trip, req.user.id), rules: Trip.RULES });
});
