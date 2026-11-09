const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { pool } = require('./db');

const maxAgeDays = Number(process.env.SESSION_MAX_AGE_DAYS || 7);

const store = new MySQLStore({ createDatabaseTable: true, clearExpired: true }, pool);

module.exports = session({
  name: 'bp.sid',
  secret: process.env.SESSION_SECRET,
  store,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  },
});
