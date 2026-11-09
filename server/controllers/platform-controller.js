const { pool } = require('../config/db');
const { HttpError, asyncHandler, toId, str } = require('../utils/http');

// ---------- Notifications (any user) ----------

exports.notifications = asyncHandler(async (req, res) => {
  const [items] = await pool.query(
    'SELECT id, type, payload, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  const [[{ unread }]] = await pool.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.user.id]);
  res.json({ items, unread });
});

exports.unreadCount = asyncHandler(async (req, res) => {
  const [[{ unread }]] = await pool.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.user.id]);
  res.json({ unread });
});

exports.markRead = asyncHandler(async (req, res) => {
  if (req.params.id === 'all') {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id]);
  } else {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [toId(req.params.id), req.user.id]);
  }
  res.json({ ok: true });
});

exports.dismiss = asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [toId(req.params.id), req.user.id]);
  res.json({ ok: true });
});

// ---------- Reports (any user) ----------

const TARGETS = { user: 'users', ride: 'rides', post: 'posts', comment: 'comments' };

exports.report = asyncHandler(async (req, res) => {
  const table = TARGETS[req.body.targetType];
  if (!table) throw new HttpError(400, 'Invalid report target.');
  const targetId = toId(req.body.targetId);
  const [[exists]] = await pool.query(`SELECT id FROM ${table} WHERE id = ?`, [targetId]);
  if (!exists) throw new HttpError(404, 'Reported item not found.');
  await pool.query('INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?,?,?,?)', [
    req.user.id, req.body.targetType, targetId, str(req.body.reason, { min: 5, max: 500, field: 'Reason' }),
  ]);
  res.status(201).json({ ok: true });
});

// ---------- Admin ----------

exports.stats = asyncHandler(async (req, res) => {
  const [[s]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM rides WHERE status = 'published') AS active_rides,
    (SELECT COUNT(*) FROM trips WHERE status = 'active') AS active_trips,
    (SELECT COUNT(*) FROM reports WHERE status = 'open') AS open_reports`);
  res.json(s);
});

exports.users = asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const [users] = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.role, u.status, u.created_at, l.name AS city
     FROM users u LEFT JOIN locations l ON l.id = u.home_location_id
     ${q ? 'WHERE u.email LIKE ? OR u.display_name LIKE ?' : ''}
     ORDER BY u.created_at DESC LIMIT 100`,
    q ? [`%${q}%`, `%${q}%`] : []
  );
  res.json({ users });
});

exports.setUserStatus = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const status = req.body.status === 'suspended' ? 'suspended' : 'active';
  if (id === req.user.id) throw new HttpError(400, 'You cannot change your own status.');
  await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
  res.json({ ok: true });
});

exports.reports = asyncHandler(async (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const [reports] = await pool.query(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at, u.display_name AS reporter_name
     FROM reports r JOIN users u ON u.id = r.reporter_id WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 100`,
    [status]
  );
  res.json({ reports });
});

/** Resolve a report; optionally hide the reported content or suspend the reported user. */
exports.resolveReport = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const [[report]] = await pool.query('SELECT * FROM reports WHERE id = ?', [id]);
  if (!report) throw new HttpError(404, 'Report not found.');
  const action = req.body.action; // 'hide' | 'suspend' | 'cancel_ride' | 'dismiss'
  if (action === 'hide' && ['post', 'comment'].includes(report.target_type)) {
    await pool.query(`UPDATE ${TARGETS[report.target_type]} SET is_hidden = TRUE WHERE id = ?`, [report.target_id]);
  } else if (action === 'suspend' && report.target_type === 'user') {
    await pool.query(`UPDATE users SET status = 'suspended' WHERE id = ? AND role <> 'admin'`, [report.target_id]);
  } else if (action === 'cancel_ride' && report.target_type === 'ride') {
    await pool.query(`UPDATE rides SET status = 'cancelled' WHERE id = ?`, [report.target_id]);
  } else if (action !== 'dismiss') {
    throw new HttpError(400, 'Action does not apply to this report.');
  }
  await pool.query('UPDATE reports SET status = ? WHERE id = ?', [action === 'dismiss' ? 'dismissed' : 'resolved', id]);
  res.json({ ok: true });
});

exports.rides = asyncHandler(async (req, res) => {
  const [rides] = await pool.query(
    `SELECT r.id, r.title, r.status, r.start_date, r.end_date, r.capacity, u.display_name AS host_name
     FROM rides r JOIN users u ON u.id = r.host_id ORDER BY r.created_at DESC LIMIT 100`
  );
  res.json({ rides });
});

exports.setRideStatus = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const status = ['published', 'cancelled', 'completed'].includes(req.body.status) ? req.body.status : null;
  if (!status) throw new HttpError(400, 'Invalid status.');
  await pool.query('UPDATE rides SET status = ? WHERE id = ?', [status, id]);
  res.json({ ok: true });
});
