const express = require('express');
const { tempUser } = require('../models/tempuser_reduser');
const { jwtAuthMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Visitor's remaining time, always computed from the server clock.
router.get('/', jwtAuthMiddleware, requireRole('visitor'), async (req, res) => {
  try {
    const visit = await tempUser.findById(req.user.userId);
    if (!visit) return res.status(401).json({ error: 'Temporary pass was removed by security' });
    const secondsLeft = Math.max(0, Math.floor((visit.tilltime.getTime() - Date.now()) / 1000));
    return res.json({ secondsLeft, plate: visit.plate, status: visit.status });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
