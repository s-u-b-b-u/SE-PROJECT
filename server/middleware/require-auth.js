const { pool } = require('../config/db');

/** Requires a logged-in, non-suspended user. Attaches req.user. */
async function requireAuth(req, res, next) {
  try {
    const id = req.session.userId;
    if (!id) return res.status(401).json({ error: 'Please log in to continue.' });
    const [[user]] = await pool.query('SELECT id, display_name, role, status FROM users WHERE id = ?', [id]);
    if (!user || user.status !== 'active') {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Your session has ended. Please log in again.' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;
