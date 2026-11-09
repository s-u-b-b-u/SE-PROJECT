const { pool } = require('../config/db');
const { HttpError, asyncHandler, toId, str } = require('../utils/http');
const locations = require('../models/location-model');
const { sessionUser } = require('./auth-controller');

exports.getProfile = asyncHandler(async (req, res) => {
  const id = toId(req.params.id);
  const [[user]] = await pool.query(
    `SELECT u.id, u.display_name, u.bike_model, u.bio, u.created_at,
            l.name AS home_location_name, l.state AS home_location_state,
            (SELECT ROUND(AVG(rv.rating),1) FROM reviews rv JOIN rides r ON r.id = rv.ride_id WHERE r.host_id = u.id) AS host_rating,
            (SELECT COUNT(*) FROM rides r WHERE r.host_id = u.id AND r.status IN ('published','completed')) AS rides_hosted,
            (SELECT COUNT(*) FROM ride_participants p WHERE p.user_id = u.id AND p.status = 'joined') AS rides_joined
     FROM users u LEFT JOIN locations l ON l.id = u.home_location_id
     WHERE u.id = ? AND u.status = 'active'`,
    [id]
  );
  if (!user) throw new HttpError(404, 'Rider not found.');

  const [hosted] = await pool.query(
    `SELECT r.id, r.title, r.start_date, r.end_date, r.status, s.name AS start_name, e.name AS end_name
     FROM rides r JOIN locations s ON s.id = r.start_location_id JOIN locations e ON e.id = r.end_location_id
     WHERE r.host_id = ? AND r.status IN ('published','completed') ORDER BY r.start_date DESC LIMIT 20`,
    [id]
  );
  const [joined] = await pool.query(
    `SELECT r.id, r.title, r.start_date, r.end_date, r.status, s.name AS start_name, e.name AS end_name
     FROM ride_participants p JOIN rides r ON r.id = p.ride_id
     JOIN locations s ON s.id = r.start_location_id JOIN locations e ON e.id = r.end_location_id
     WHERE p.user_id = ? AND p.status = 'joined' ORDER BY r.start_date DESC LIMIT 20`,
    [id]
  );
  const [trips] = await pool.query(
    `SELECT t.id, t.start_date, t.end_date, o.name AS origin_name, d.name AS destination_name
     FROM trips t JOIN locations o ON o.id = t.origin_location_id JOIN locations d ON d.id = t.destination_location_id
     WHERE t.user_id = ? AND t.status = 'active' ORDER BY t.start_date LIMIT 20`,
    [id]
  );
  const [reviews] = await pool.query(
    `SELECT rv.rating, rv.comment, rv.created_at, r.title AS ride_title, u.display_name AS reviewer_name
     FROM reviews rv JOIN rides r ON r.id = rv.ride_id JOIN users u ON u.id = rv.reviewer_id
     WHERE r.host_id = ? ORDER BY rv.created_at DESC LIMIT 20`,
    [id]
  );
  res.json({ user, hosted, joined, trips, reviews });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const displayName = str(req.body.displayName, { max: 80, min: 2, field: 'Display name' });
  const home = await locations.requireValid(req.body.homeLocationId, 'Home city');
  const bikeModel = str(req.body.bikeModel, { max: 120, field: 'Bike model' });
  const bio = str(req.body.bio, { max: 600, field: 'Bio' });
  await pool.query(
    'UPDATE users SET display_name = ?, home_location_id = ?, bike_model = ?, bio = ? WHERE id = ?',
    [displayName, home.id, bikeModel, bio, req.user.id]
  );
  res.json({ user: await sessionUser(req.user.id) });
});
