const { pool } = require('../config/db');

/**
 * Creates an in-app notification. `db` may be a transaction connection.
 * Types: ride_joined, ride_left, ride_updated, ride_cancelled, participant_removed,
 *        connection_request, connection_accepted, comment, review
 */
async function notify(userId, type, payload, db = pool) {
  await db.query('INSERT INTO notifications (user_id, type, payload) VALUES (?,?,?)', [
    userId, type, JSON.stringify(payload),
  ]);
}

async function notifyMany(userIds, type, payload, db = pool) {
  const rows = [...new Set(userIds)].map((id) => [id, type, JSON.stringify(payload)]);
  if (rows.length) await db.query('INSERT INTO notifications (user_id, type, payload) VALUES ?', [rows]);
}

module.exports = { notify, notifyMany };
