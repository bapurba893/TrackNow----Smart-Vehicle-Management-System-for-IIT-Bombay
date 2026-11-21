const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

const secret = () => config.jwtSecret;

const generateToken = (payload) => jwt.sign(payload, secret(), { expiresIn: '7d' });

// One-time pass embedded in the QR code: valid 5 minutes, single use (jti).
const generateTempToken = (payload) =>
  jwt.sign({ ...payload, jti: crypto.randomUUID(), purpose: 'TEMP_LOGIN' }, secret(), { expiresIn: '5m' });

const verifyToken = (token) => jwt.verify(token, secret());

const bearer = (req) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
};

const jwtAuthMiddleware = (req, res, next) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Token missing' });
  try {
    req.user = verifyToken(token);
    if (req.user.purpose === 'TEMP_LOGIN') {
      return res.status(403).json({ error: 'A QR pass token cannot be used as a session token' });
    }
    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const jwtAuthTempMiddleware = (req, res, next) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Pass token missing' });
  try {
    const decoded = verifyToken(token);
    if (decoded.purpose !== 'TEMP_LOGIN') {
      return res.status(403).json({ error: 'Not a QR pass token' });
    }
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired QR pass' });
  }
};

// Must be used after jwtAuthMiddleware.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have permission for this action' });
  }
  return next();
};

module.exports = {
  generateToken,
  generateTempToken,
  verifyToken,
  jwtAuthMiddleware,
  jwtAuthTempMiddleware,
  requireRole,
};
