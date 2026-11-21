// Security guard issues a QR pass; the visitor scans it to start a timed session.
const express = require('express');
const { tempUser, redUser, VEHICLE_TYPES } = require('../models/tempuser_reduser');
const { isValidPlate } = require('../utils/plate');
const {
  jwtAuthMiddleware,
  jwtAuthTempMiddleware,
  requireRole,
  generateTempToken,
  generateToken,
} = require('../middleware/auth');

const router = express.Router();
const MAX_MINUTES = 24 * 60;

// Pass ids already redeemed (QR tokens live only a few minutes, so memory is enough).
const usedPassIds = new Map(); // jti -> expiry (ms)
const markUsed = (jti, expSeconds) => {
  const now = Date.now();
  for (const [id, exp] of usedPassIds) if (exp < now) usedPassIds.delete(id);
  usedPassIds.set(jti, expSeconds * 1000);
};

router.get('/checkredlist', jwtAuthMiddleware, requireRole('security'), async (req, res) => {
  const plate = String(req.query.plate || '').toUpperCase();
  if (!isValidPlate(plate)) return res.status(400).json({ error: 'Invalid plate number' });
  try {
    const record = await redUser.findOne({ plate });
    return res.status(200).json({ isRed: Boolean(record), count: record ? record.count : 0 });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.post('/tempadd', jwtAuthMiddleware, requireRole('security'), (req, res) => {
  const plate = String(req.body?.plate || '').toUpperCase().replace(/\s+/g, '');
  const { type } = req.body || {};
  const minutes = Number(req.body?.minutes);

  if (!isValidPlate(plate)) return res.status(400).json({ error: 'Invalid plate number (e.g. MH01AB1234)' });
  if (!VEHICLE_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid vehicle type' });
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    return res.status(400).json({ error: `Allotted time must be 1–${MAX_MINUTES} minutes` });
  }

  const token = generateTempToken({ plate, type, minutes, issuedBy: req.user.id });
  return res.status(200).json({ token });
});

router.post('/templogin', jwtAuthTempMiddleware, async (req, res) => {
  const { jti, exp, plate, type, minutes } = req.user;

  if (usedPassIds.has(jti)) return res.status(409).json({ error: 'QR already used. Access denied.' });

  try {
    const existing = await tempUser.findOne({ plate });
    if (existing && existing.status === 'temp' && existing.tilltime > new Date()) {
      return res.status(409).json({ error: 'This vehicle already has an active pass' });
    }
    // An expired / red-listed record from a previous visit is replaced; the
    // overstay history is kept in the redUser collection.
    if (existing) await tempUser.deleteOne({ _id: existing._id });

    markUsed(jti, exp);
    const now = new Date();
    const visit = await tempUser.create({
      plate,
      type,
      time: now,
      tilltime: new Date(now.getTime() + minutes * 60000),
      status: 'temp',
    });

    const payload = {
      userId: visit.id,
      plate: visit.plate,
      type: visit.type,
      time: visit.time,
      tilltime: visit.tilltime,
      role: 'visitor',
    };
    return res.status(200).json({ token: generateToken(payload), payload });
  } catch (err) {
    console.error('templogin failed:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
