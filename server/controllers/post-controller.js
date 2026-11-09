const { pool } = require('../config/db');
const { HttpError, asyncHandler, toId, str } = require('../utils/http');
const { notify } = require('../models/notification-model');

exports.feed = asyncHandler(async (req, res) => {
  const limit = Math.min(30, Number(req.query.limit) || 10);
  const before = Number(req.query.before) || null; // cursor = post id
  const [posts] = await pool.query(
    `SELECT p.id, p.body, p.created_at, p.ride_id, r.title AS ride_title,
            u.id AS user_id, u.display_name, u.bike_model,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_hidden = FALSE) AS comment_count
     FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN rides r ON r.id = p.ride_id
     WHERE p.is_hidden = FALSE AND u.status = 'active' ${before ? 'AND p.id < ?' : ''}
     ORDER BY p.id DESC LIMIT ?`,
    before ? [before, limit] : [limit]
  );
  res.json({ posts, nextCursor: posts.length === limit ? posts.at(-1).id : null });
});

exports.create = asyncHandler(async (req, res) => {
  const body = str(req.body.body, { min: 1, max: 4000, field: 'Post' });
  let rideId = null;
  if (req.body.rideId) {
    rideId = toId(req.body.rideId);
    const [[r]] = await pool.query(`SELECT id FROM rides WHERE id = ? AND status <> 'draft'`, [rideId]);
    if (!r) throw new HttpError(400, 'Linked ride not found.');
  }
  const [r] = await pool.query('INSERT INTO posts (user_id, ride_id, body) VALUES (?,?,?)', [req.user.id, rideId, body]);
  res.status(201).json({ id: r.insertId });
});

exports.remove = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const [r] = await pool.query('DELETE FROM posts WHERE id = ? AND (user_id = ? OR ? = TRUE)', [id, req.user.id, req.user.role === 'admin']);
  if (!r.affectedRows) throw new HttpError(404, 'Post not found.');
  res.json({ ok: true });
});

exports.comments = asyncHandler(async (req, res) => {
  const postId = toId(req.params.id);
  const [comments] = await pool.query(
    `SELECT c.id, c.body, c.created_at, u.id AS user_id, u.display_name
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? AND c.is_hidden = FALSE ORDER BY c.created_at`,
    [postId]
  );
  res.json({ comments });
});

exports.addComment = asyncHandler(async (req, res) => {
  const postId = toId(req.params.id);
  const [[post]] = await pool.query('SELECT id, user_id FROM posts WHERE id = ? AND is_hidden = FALSE', [postId]);
  if (!post) throw new HttpError(404, 'Post not found.');
  const body = str(req.body.body, { min: 1, max: 1000, field: 'Comment' });
  const [r] = await pool.query('INSERT INTO comments (post_id, user_id, body) VALUES (?,?,?)', [postId, req.user.id, body]);
  if (post.user_id !== req.user.id) {
    await notify(post.user_id, 'comment', { postId, name: req.user.display_name });
  }
  res.status(201).json({ id: r.insertId });
});

exports.removeComment = asyncHandler(async (req, res) => {
  const id = toId(req.params.commentId);
  const [r] = await pool.query('DELETE FROM comments WHERE id = ? AND (user_id = ? OR ? = TRUE)', [id, req.user.id, req.user.role === 'admin']);
  if (!r.affectedRows) throw new HttpError(404, 'Comment not found.');
  res.json({ ok: true });
});
