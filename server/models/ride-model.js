const { pool } = require('../config/db');
const { seatsLeft } = require('../utils/participation');
const { boundingBox } = require('../utils/geo');

const CARD_SELECT = `
  SELECT r.id, r.title, r.start_date, r.end_date, r.is_tentative, r.capacity, r.expense_type, r.status,
         r.host_id, h.display_name AS host_name,
         s.id AS start_id, s.name AS start_name, s.state AS start_state,
         e.id AS end_id, e.name AS end_name, e.state AS end_state,
         (SELECT COUNT(*) FROM ride_stops rs WHERE rs.ride_id = r.id) AS stop_count
  FROM rides r
  JOIN users h ON h.id = r.host_id
  JOIN locations s ON s.id = r.start_location_id
  JOIN locations e ON e.id = r.end_location_id`;

/** Attach seats_left to a list of ride rows (one query for all participants). */
async function withSeats(rides, db = pool) {
  if (!rides.length) return rides;
  const [parts] = await db.query(
    `SELECT ride_id, join_date, leave_date FROM ride_participants WHERE status = 'joined' AND ride_id IN (?)`,
    [rides.map((r) => r.id)]
  );
  return rides.map((r) => {
    const active = parts.filter((p) => p.ride_id === r.id);
    return { ...r, participant_count: active.length, seats_left: seatsLeft(r.capacity, active, r.start_date, r.end_date) };
  });
}

/**
 * Published, upcoming rides with optional filters.
 * fromLoc / toLoc: {lat,lng} — match start/end within radiusKm.
 */
async function list({ q, fromLoc, toLoc, radiusKm = 100, dateFrom, dateTo, expense, sort, limit = 12, offset = 0, minSeats }) {
  const where = [`r.status = 'published'`, `r.end_date >= CURDATE()`];
  const params = [];
  if (q) { where.push('(r.title LIKE ? OR s.name LIKE ? OR e.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  for (const [loc, alias] of [[fromLoc, 's'], [toLoc, 'e']]) {
    if (!loc) continue;
    const b = boundingBox(Number(loc.lat), Number(loc.lng), radiusKm);
    where.push(`${alias}.lat BETWEEN ? AND ? AND ${alias}.lng BETWEEN ? AND ?`);
    params.push(b.minLat, b.maxLat, b.minLng, b.maxLng);
    where.push(`ST_Distance_Sphere(POINT(${alias}.lng, ${alias}.lat), POINT(?, ?)) <= ?`);
    params.push(Number(loc.lng), Number(loc.lat), radiusKm * 1000);
  }
  if (dateFrom) { where.push('r.end_date >= ?'); params.push(dateFrom); }
  if (dateTo) { where.push('r.start_date <= ?'); params.push(dateTo); }
  if (expense) { where.push('r.expense_type = ?'); params.push(expense); }
  const order = sort === 'newest' ? 'r.created_at DESC' : 'r.start_date ASC';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM rides r JOIN locations s ON s.id = r.start_location_id
     JOIN locations e ON e.id = r.end_location_id WHERE ${where.join(' AND ')}`,
    params
  );
  const [rows] = await pool.query(
    `${CARD_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  let rides = await withSeats(rows);
  if (minSeats) rides = rides.filter((r) => r.seats_left >= minSeats);
  return { rides, total };
}

async function findById(id, db = pool, lock = false) {
  const [[ride]] = await db.query(`SELECT * FROM rides WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
  return ride || null;
}

async function stopsFor(rideId, db = pool) {
  const [rows] = await db.query(
    `SELECT rs.id, rs.stop_order, rs.planned_date, l.id AS location_id, l.name, l.state, l.lat, l.lng, l.kind
     FROM ride_stops rs JOIN locations l ON l.id = rs.location_id
     WHERE rs.ride_id = ? ORDER BY rs.stop_order`,
    [rideId]
  );
  return rows;
}

async function activeParticipants(rideId, db = pool) {
  const [rows] = await db.query(
    `SELECT p.id, p.user_id, p.join_stop_id, p.leave_stop_id, p.join_date, p.leave_date,
            u.display_name, u.bike_model
     FROM ride_participants p JOIN users u ON u.id = p.user_id
     WHERE p.ride_id = ? AND p.status = 'joined' ORDER BY p.created_at`,
    [rideId]
  );
  return rows;
}

module.exports = { CARD_SELECT, withSeats, list, findById, stopsFor, activeParticipants };
