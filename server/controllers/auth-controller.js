const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { HttpError, asyncHandler, str } = require('../utils/http');
const locations = require('../models/location-model');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const sessionUser = async (id) => {
  const [[u]] = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.bike_model, u.bio, u.role, u.home_location_id,
            l.name AS home_location_name, l.state AS home_location_state
     FROM users u LEFT JOIN locations l ON l.id = u.home_location_id WHERE u.id = ?`,
    [id]
  );
  return u;
};

/** Regenerate the session id on login to prevent fixation. */
const startSession = (req, userId) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((e) => (e ? reject(e) : resolve()));
    })
  );

exports.register = asyncHandler(async (req, res) => {
  const email = str(req.body.email, { max: 190, min: 1, field: 'Email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  const displayName = str(req.body.displayName, { max: 80, min: 2, field: 'Display name' });
  const home = await locations.requireValid(req.body.homeLocationId, 'Home city');

  const [[exists]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exists) throw new HttpError(409, 'An account with this email already exists.');

  const hash = await bcrypt.hash(password, 12);
  const [r] = await pool.query(
    'INSERT INTO users (email, password_hash, display_name, home_location_id, bike_model) VALUES (?,?,?,?,?)',
    [email, hash, displayName, home.id, str(req.body.bikeModel, { max: 120, field: 'Bike model' })]
  );
  await startSession(req, r.insertId);
  res.status(201).json({ user: await sessionUser(r.insertId) });
});

exports.login = asyncHandler(async (req, res) => {
  const email = str(req.body.email, { max: 190, field: 'Email' }).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const [[user]] = await pool.query('SELECT id, password_hash, status FROM users WHERE email = ?', [email]);
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw new HttpError(401, 'Incorrect email or password.');
  if (user.status !== 'active') throw new HttpError(403, 'This account has been suspended.');
  await startSession(req, user.id);
  res.json({ user: await sessionUser(user.id) });
});

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('bp.sid');
    res.json({ ok: true });
  });
};

exports.me = asyncHandler(async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await sessionUser(req.session.userId);
  res.json({ user: user || null });
});

exports.sessionUser = sessionUser;
