require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('./config/session');
const apiRoutes = require('./routes/api-routes');
const errorHandler = require('./middleware/error-handler');

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
const CLIENT_DIR = path.join(__dirname, '..', 'client');

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(session);

app.use('/api', apiRoutes);

// Static client: /css, /js, /assets, and clean page URLs (/discover-rides -> pages/discover-rides.html)
app.use('/css', express.static(path.join(CLIENT_DIR, 'css')));
app.use('/js', express.static(path.join(CLIENT_DIR, 'js')));
app.use('/assets', express.static(path.join(CLIENT_DIR, 'assets'), { maxAge: '7d' }));
app.use(express.static(path.join(CLIENT_DIR, 'pages'), { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(CLIENT_DIR, 'pages', '404.html')));

app.use(errorHandler);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Bikers Portal running at http://localhost:${port}`));
