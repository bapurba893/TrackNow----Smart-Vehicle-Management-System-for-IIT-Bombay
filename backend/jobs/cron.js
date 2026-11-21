const cron = require('node-cron');
const { tempUser, redUser } = require('../models/tempuser_reduser');
const { removeTempUser, emitToGuards } = require('../socketserver/securitySocket');

// Moves every visitor whose pass has run out to the red list and alerts guards.
async function redListExpiredVisitors(now = new Date()) {
  const expired = await tempUser.find({ status: 'temp', tilltime: { $lt: now } });

  for (const visit of expired) {
    await tempUser.updateOne({ _id: visit._id }, { status: 'red' });
    const record = await redUser.findOneAndUpdate(
      { plate: visit.plate },
      { $inc: { count: 1 }, $setOnInsert: { type: visit.type } },
      { upsert: true, new: true }
    );
    removeTempUser(visit.id);
    emitToGuards('redListAlert', {
      plate: visit.plate,
      type: visit.type,
      tilltime: visit.tilltime,
      count: record.count,
    });
  }
  return expired.length;
}

function startAutoRedListJob() {
  return cron.schedule('* * * * *', () =>
    redListExpiredVisitors().catch((err) => console.error('Auto red-list job failed:', err.message))
  );
}

module.exports = startAutoRedListJob;
module.exports.redListExpiredVisitors = redListExpiredVisitors;
