// All REST routes, mounted at /api. snake_case DB, camelCase JSON bodies, kebab/plural paths.
const express = require('express');
const requireAuth = require('../middleware/require-auth');
const requireAdmin = require('../middleware/require-admin');
const { asyncHandler } = require('../utils/http');
const locations = require('../models/location-model');
const auth = require('../controllers/auth-controller');
const users = require('../controllers/user-controller');
const rides = require('../controllers/ride-controller');
const trips = require('../controllers/trip-controller');
const connections = require('../controllers/connection-controller');
const posts = require('../controllers/post-controller');
const platform = require('../controllers/platform-controller');

const router = express.Router();

// Auth
router.post('/auth/register', auth.register);
router.post('/auth/login', auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', auth.me);

// Locations (autocomplete)
router.get('/locations', asyncHandler(async (req, res) => {
  res.json({ locations: await locations.search(String(req.query.q || '').slice(0, 60)) });
}));

// Users
router.get('/users/:id', users.getProfile);
router.put('/users/me', requireAuth, users.updateMe);

// Rides
router.get('/rides', rides.list);
router.get('/rides/mine', requireAuth, rides.mine);
router.get('/rides/:id', rides.detail);
router.post('/rides', requireAuth, rides.create);
router.put('/rides/:id', requireAuth, rides.update);
router.post('/rides/:id/cancel', requireAuth, rides.cancel);
router.post('/rides/:id/complete', requireAuth, rides.complete);
router.post('/rides/:id/participants', requireAuth, rides.join);
router.delete('/rides/:id/participants/me', requireAuth, rides.leave);
router.delete('/rides/:id/participants/:userId', requireAuth, rides.removeParticipant);
router.post('/rides/:id/reviews', requireAuth, rides.review);

// Trips & matching
router.get('/trips/mine', requireAuth, trips.mine);
router.post('/trips', requireAuth, trips.create);
router.put('/trips/:id', requireAuth, trips.update);
router.post('/trips/:id/close', requireAuth, trips.close);
router.get('/trips/:id/matches', requireAuth, trips.matches);

// Connections
router.get('/connections', requireAuth, connections.list);
router.post('/connections', requireAuth, connections.send);
router.post('/connections/:id/accept', requireAuth, connections.accept);
router.post('/connections/:id/reject', requireAuth, connections.reject);
router.post('/connections/:id/withdraw', requireAuth, connections.withdraw);
router.post('/connections/:id/remove', requireAuth, connections.remove);

// Community
router.get('/posts', posts.feed);
router.post('/posts', requireAuth, posts.create);
router.delete('/posts/:id', requireAuth, posts.remove);
router.get('/posts/:id/comments', posts.comments);
router.post('/posts/:id/comments', requireAuth, posts.addComment);
router.delete('/posts/:id/comments/:commentId', requireAuth, posts.removeComment);

// Notifications & reports
router.get('/notifications', requireAuth, platform.notifications);
router.get('/notifications/unread-count', requireAuth, platform.unreadCount);
router.post('/notifications/:id/read', requireAuth, platform.markRead);
router.delete('/notifications/:id', requireAuth, platform.dismiss);
router.post('/reports', requireAuth, platform.report);

// Admin
const admin = express.Router();
admin.use(requireAuth, requireAdmin);
admin.get('/stats', platform.stats);
admin.get('/users', platform.users);
admin.post('/users/:id/status', platform.setUserStatus);
admin.get('/reports', platform.reports);
admin.post('/reports/:id/resolve', platform.resolveReport);
admin.get('/rides', platform.rides);
admin.post('/rides/:id/status', platform.setRideStatus);
router.use('/admin', admin);

router.use((req, res) => res.status(404).json({ error: 'API route not found.' }));

module.exports = router;
