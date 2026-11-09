const { pool, withTransaction } = require('../config/db');
const { HttpError, asyncHandler, toId, str } = require('../utils/http');
const { notify } = require('../models/notification-model');

const LIST_SELECT = `
  SELECT c.id, c.status, c.message, c.created_at, c.updated_at, c.trip_id,
         c.requester_id, c.addressee_id,
         u.id AS other_id, u.display_name AS other_name, u.bike_model AS other_bike,
         l.name AS other_city
  FROM connections c
  JOIN users u ON u.id = IF(c.requester_id = ?, c.addressee_id, c.requester_id)
  LEFT JOIN locations l ON l.id = u.home_location_id`;

exports.list = asyncHandler(async (req, res) => {
  const me = req.user.id;
  const [rows] = await pool.query(
    `${LIST_SELECT} WHERE (c.requester_id = ? OR c.addressee_id = ?) AND c.status IN ('pending','accepted')
     ORDER BY c.updated_at DESC`,
    [me, me, me]
  );
  res.json({
    received: rows.filter((r) => r.status === 'pending' && r.addressee_id === me),
    sent: rows.filter((r) => r.status === 'pending' && r.requester_id === me),
    connected: rows.filter((r) => r.status === 'accepted'),
  });
});

exports.send = asyncHandler(async (req, res) => {
  const addresseeId = toId(req.body.userId);
  if (addresseeId === req.user.id) throw new HttpError(400, 'You cannot connect with yourself.');
  const [[target]] = await pool.query(`SELECT id FROM users WHERE id = ? AND status = 'active'`, [addresseeId]);
  if (!target) throw new HttpError(404, 'Rider not found.');
  let tripId = null;
  if (req.body.tripId) {
    tripId = toId(req.body.tripId);
    const [[t]] = await pool.query('SELECT id FROM trips WHERE id = ? AND user_id = ?', [tripId, req.user.id]);
    if (!t) throw new HttpError(400, 'Trip not found.');
  }
  // The generated-column unique key rejects a second pending/accepted row for this pair.
  try {
    const [r] = await pool.query(
      'INSERT INTO connections (requester_id, addressee_id, trip_id, message) VALUES (?,?,?,?)',
      [req.user.id, addresseeId, tripId, str(req.body.message, { max: 300, field: 'Message' })]
    );
    await notify(addresseeId, 'connection_request', { connectionId: r.insertId, userId: req.user.id, name: req.user.display_name });
    res.status(201).json({ id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'You already have a pending or active connection with this rider.');
    throw err;
  }
});

/** Transitions: addressee accepts/rejects a pending request; requester withdraws; either removes an accepted one. */
const transition = (action) => asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const me = req.user.id;
  const result = await withTransaction(async (db) => {
    const [[c]] = await db.query('SELECT * FROM connections WHERE id = ? FOR UPDATE', [id]);
    if (!c || (c.requester_id !== me && c.addressee_id !== me)) throw new HttpError(404, 'Connection not found.');
    const rules = {
      accept: { from: 'pending', who: c.addressee_id, to: 'accepted' },
      reject: { from: 'pending', who: c.addressee_id, to: 'rejected' },
      withdraw: { from: 'pending', who: c.requester_id, to: 'withdrawn' },
      remove: { from: 'accepted', who: me, to: 'withdrawn' },
    }[action];
    if (c.status !== rules.from || rules.who !== me) throw new HttpError(409, `This request cannot be ${action === 'remove' ? 'removed' : action + 'ed'} now.`);
    await db.query('UPDATE connections SET status = ? WHERE id = ?', [rules.to, id]);
    return c;
  });
  if (action === 'accept') {
    await notify(result.requester_id, 'connection_accepted', { connectionId: id, userId: me, name: req.user.display_name });
  }
  res.json({ ok: true });
});

exports.accept = transition('accept');
exports.reject = transition('reject');
exports.withdraw = transition('withdraw');
exports.remove = transition('remove');
