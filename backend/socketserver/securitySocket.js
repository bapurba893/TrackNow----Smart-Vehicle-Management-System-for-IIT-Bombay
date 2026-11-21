// Visitor vehicles share their location; only security guards receive it.
const { tempUser } = require('../models/tempuser_reduser');
const { socketAuth, isValidCoord } = require('./socketAuth');

const GUARDS = 'guards';
const activeTempUsers = new Map(); // userId -> { userId, plate, type, lat, lng }
let securityIO = null;

const broadcast = () => {
  if (securityIO) securityIO.to(GUARDS).emit('tempUsersUpdate', Array.from(activeTempUsers.values()));
};

const removeTempUser = (userId) => {
  if (activeTempUsers.delete(String(userId))) broadcast();
};

const emitToGuards = (event, data) => {
  if (securityIO) securityIO.to(GUARDS).emit(event, data);
};

function initSecuritySocket(io) {
  securityIO = io.of('/security');
  securityIO.use(socketAuth);

  securityIO.on('connection', (socket) => {
    const user = socket.data.user;

    if (user.role === 'security') {
      socket.join(GUARDS);
      socket.emit('tempUsersUpdate', Array.from(activeTempUsers.values()));
      return;
    }

    if (user.role !== 'visitor') {
      socket.disconnect(true);
      return;
    }

    socket.on('tempUserLocation', async ({ lat, lng } = {}) => {
      if (!isValidCoord(lat, lng)) return;
      try {
        const visit = await tempUser.findById(user.userId);
        // Removed by a guard, or pass time is over: stop tracking.
        if (!visit || visit.status !== 'temp' || Date.now() > visit.tilltime.getTime()) {
          removeTempUser(user.userId);
          socket.emit('passEnded');
          return;
        }
        activeTempUsers.set(String(user.userId), {
          userId: String(user.userId),
          plate: visit.plate,
          type: visit.type,
          tilltime: visit.tilltime,
          lat,
          lng,
        });
        broadcast();
      } catch (err) {
        console.error('tempUserLocation failed:', err.message);
      }
    });
    // On disconnect we keep the last known position: visitors may reconnect,
    // and expiry/removal cleans the entry up.
  });
}

module.exports = initSecuritySocket;
module.exports.removeTempUser = removeTempUser;
module.exports.emitToGuards = emitToGuards;
