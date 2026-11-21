const express = require('express');
const cors = require('cors');
const config = require('./config');
const users = require('./models/users');
const createAuthRouter = require('./routes/authRoutes');
const { jwtAuthMiddleware } = require('./middleware/auth');

const app = express();

app.use(
  cors({
    // Unknown origins get no CORS headers, so browsers block them.
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);
app.use(express.json({ limit: '100kb' }));

app.get('/', (_req, res) => res.send('TrackNow API is running'));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/user', createAuthRouter('user'));
app.use('/driver', createAuthRouter('driver'));
app.use('/security', createAuthRouter('security', { requireSignupCode: true }));
app.use('/adduser', require('./routes/passRoutes'));
app.use('/manageuser', require('./routes/manageuserRoutes'));
app.use('/tempuserhome', require('./routes/tempuserRoutes'));

// A logged-in account can change only its own password.
app.put('/changepassword/:id', jwtAuthMiddleware, async (req, res) => {
  const id = req.params.id.trim();
  const { password } = req.body || {};
  if (!req.user.id || req.user.id !== id) {
    return res.status(403).json({ error: 'You can only change your own password' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    await users.updatePasswordById(id, password);
    return res.status(200).json({ message: 'Password updated' });
  } catch (err) {
    console.error('Change password failed:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = app;
