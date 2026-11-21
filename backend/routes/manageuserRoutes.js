const express = require('express');
const mongoose = require('mongoose');
const { tempUser, redUser } = require('../models/tempuser_reduser');
const { jwtAuthMiddleware, requireRole } = require('../middleware/auth');
const { removeTempUser } = require('../socketserver/securitySocket');

const router = express.Router();
router.use(jwtAuthMiddleware, requireRole('security'));

router.get('/activeuser', async (_req, res) => {
  try {
    return res.status(200).json(await tempUser.find().sort({ time: -1 }));
  } catch {
    return res.status(500).json({ error: 'Database error' });
  }
});

router.get('/reduser', async (_req, res) => {
  try {
    return res.status(200).json(await tempUser.find({ status: 'red' }).sort({ tilltime: -1 }));
  } catch {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Full overstay history (plate -> number of times red-listed).
router.get('/redlist', async (_req, res) => {
  try {
    return res.status(200).json(await redUser.find().sort({ count: -1 }));
  } catch {
    return res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/removeuser/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const deleted = await tempUser.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    removeTempUser(id);
    return res.status(200).json({ message: 'User removed successfully', userId: id });
  } catch {
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
