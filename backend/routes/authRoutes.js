const express = require('express');
const crypto = require('crypto');
const users = require('../models/users');
const config = require('../config');
const { generateToken } = require('../middleware/auth');

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Builds /signup and /login for one role (user, driver or security).
const createAuthRouter = (role, { requireSignupCode = false } = {}) => {
  const router = express.Router();

  const sessionFor = (u) => {
    const payload = { id: u.id, rollNoOrPlate: u.rollNoOrPlate, role: u.role };
    return { token: generateToken(payload), user: payload };
  };

  router.post('/signup', async (req, res) => {
    const { rollNoOrPlate, password, signupCode } = req.body || {};
    const id = typeof rollNoOrPlate === 'string' ? rollNoOrPlate.trim().toUpperCase() : '';

    if (!id || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'ID and a password of at least 6 characters are required' });
    }
    if (requireSignupCode) {
      // Guards can see every visitor's location, so their accounts must be gated.
      if (!config.securitySignupCode || !safeEqual(signupCode || '', config.securitySignupCode)) {
        return res.status(403).json({ error: 'Invalid security signup code' });
      }
    }

    try {
      const saved = await users.create({ rollNoOrPlate: id, password, role });
      return res.status(201).json(sessionFor(saved));
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'An account with this ID already exists' });
      console.error(`${role} signup failed:`, err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/login', async (req, res) => {
    const { rollNoOrPlate, password } = req.body || {};
    if (typeof rollNoOrPlate !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'ID and password are required' });
    }
    try {
      const found = await users.findOne({ rollNoOrPlate: rollNoOrPlate.trim().toUpperCase(), role });
      if (!found || !(await found.comparePassword(password))) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      return res.status(200).json(sessionFor(found));
    } catch (err) {
      console.error(`${role} login failed:`, err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};

module.exports = createAuthRouter;
