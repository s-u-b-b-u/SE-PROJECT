const { pool } = require('../config/db');
const { HttpError } = require('../utils/http');

const PUBLIC_FIELDS = `l.id, l.name, l.state, l.lat, l.lng, l.kind`;

/** Autocomplete: prefix matches first, then larger places. */
async function search(q, limit = 8) {
  const term = q.trim();
  if (term.length < 2) return [];
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM locations l
     WHERE l.name LIKE ? OR l.name LIKE ?
     ORDER BY (l.name LIKE ?) DESC, l.population DESC
     LIMIT ?`,
    [`${term}%`, `% ${term}%`, `${term}%`, limit]
  );
  return rows;
}

async function findById(id, db = pool) {
  const [[row]] = await db.query(`SELECT ${PUBLIC_FIELDS} FROM locations l WHERE l.id = ?`, [id]);
  return row || null;
}

/** Ensures a location id refers to a real place in our India dataset. */
async function requireValid(id, label = 'Location', db = pool) {
  const n = Number(id);
  const loc = Number.isInteger(n) && n > 0 ? await findById(n, db) : null;
  if (!loc) throw new HttpError(400, `${label} must be a real place picked from the list.`);
  return loc;
}

module.exports = { search, findById, requireValid };
