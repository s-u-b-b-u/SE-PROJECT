const { pool } = require('../config/db');
const { boundingBox, haversineKm } = require('../utils/geo');
const { overlapDays } = require('../utils/dates');

const RULES = {
  originKm: Number(process.env.MATCH_ORIGIN_RADIUS_KM || 100),
  destinationKm: Number(process.env.MATCH_DESTINATION_RADIUS_KM || 50),
  minOverlapDays: Number(process.env.MATCH_MIN_OVERLAP_DAYS || 1),
};

const TRIP_SELECT = `
  SELECT t.id, t.user_id, t.start_date, t.end_date, t.notes, t.status, t.created_at,
         o.id AS origin_id, o.name AS origin_name, o.state AS origin_state, o.lat AS origin_lat, o.lng AS origin_lng,
         d.id AS destination_id, d.name AS destination_name, d.state AS destination_state, d.lat AS destination_lat, d.lng AS destination_lng
  FROM trips t
  JOIN locations o ON o.id = t.origin_location_id
  JOIN locations d ON d.id = t.destination_location_id`;

async function findById(id) {
  const [[trip]] = await pool.query(`${TRIP_SELECT} WHERE t.id = ?`, [id]);
  return trip || null;
}

async function listForUser(userId) {
  const [rows] = await pool.query(`${TRIP_SELECT} WHERE t.user_id = ? ORDER BY t.status, t.start_date`, [userId]);
  return rows;
}

/**
 * Pure ranking step (exported for tests): keeps candidates that satisfy all three rules
 * and orders them by overlap days (desc), then combined distance (asc).
 */
function rankMatches(trip, candidates, rules = RULES) {
  return candidates
    .map((c) => {
      const originKm = haversineKm(+trip.origin_lat, +trip.origin_lng, +c.origin_lat, +c.origin_lng);
      const destinationKm = haversineKm(+trip.destination_lat, +trip.destination_lng, +c.destination_lat, +c.destination_lng);
      const days = overlapDays(trip.start_date, trip.end_date, c.start_date, c.end_date);
      return { ...c, origin_km: Math.round(originKm), destination_km: Math.round(destinationKm), overlap_days: days };
    })
    .filter((c) => c.origin_km <= rules.originKm && c.destination_km <= rules.destinationKm && c.overlap_days >= rules.minOverlapDays)
    .sort((a, b) => b.overlap_days - a.overlap_days || a.origin_km + a.destination_km - (b.origin_km + b.destination_km));
}

/**
 * Matches = other riders' active trips where
 *  1. origins are within 100 km (home area),
 *  2. destinations are within 50 km,
 *  3. date ranges overlap by at least 1 day.
 * SQL bounding boxes narrow candidates using indexes; haversine confirms exactly.
 */
async function findMatches(trip, viewerId) {
  const ob = boundingBox(+trip.origin_lat, +trip.origin_lng, RULES.originKm);
  const db = boundingBox(+trip.destination_lat, +trip.destination_lng, RULES.destinationKm);
  const [candidates] = await pool.query(
    `${TRIP_SELECT.replace('SELECT', 'SELECT u.display_name, u.bike_model,')}
     JOIN users u ON u.id = t.user_id
     WHERE t.status = 'active' AND u.status = 'active' AND t.user_id <> ?
       AND t.start_date <= ? AND t.end_date >= ?
       AND o.lat BETWEEN ? AND ? AND o.lng BETWEEN ? AND ?
       AND d.lat BETWEEN ? AND ? AND d.lng BETWEEN ? AND ?
     LIMIT 500`,
    [trip.user_id, trip.end_date, trip.start_date,
      ob.minLat, ob.maxLat, ob.minLng, ob.maxLng, db.minLat, db.maxLat, db.minLng, db.maxLng]
  );
  const ranked = rankMatches(trip, candidates);
  if (!ranked.length) return ranked;

  // Attach the viewer's connection state with each matched rider.
  const [conns] = await pool.query(
    `SELECT id, requester_id, addressee_id, status FROM connections
     WHERE status IN ('pending','accepted')
       AND ((requester_id = ? AND addressee_id IN (?)) OR (addressee_id = ? AND requester_id IN (?)))`,
    [viewerId, ranked.map((r) => r.user_id), viewerId, ranked.map((r) => r.user_id)]
  );
  return ranked.map((r) => {
    const c = conns.find((x) => x.requester_id === r.user_id || x.addressee_id === r.user_id);
    return {
      ...r,
      connection: c ? { id: c.id, status: c.status, direction: c.requester_id === viewerId ? 'sent' : 'received' } : null,
    };
  });
}

module.exports = { RULES, findById, listForUser, findMatches, rankMatches };
