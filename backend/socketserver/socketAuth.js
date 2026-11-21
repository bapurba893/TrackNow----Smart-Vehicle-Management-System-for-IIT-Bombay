const { verifyToken } = require('../middleware/auth');

// Socket.IO middleware: every connection must present a valid session JWT
// via io(url, { auth: { token } }).
const socketAuth = (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const user = verifyToken(token);
    if (user.purpose === 'TEMP_LOGIN') return next(new Error('unauthorized'));
    socket.data.user = user;
    return next();
  } catch {
    return next(new Error('unauthorized'));
  }
};

const isValidCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

module.exports = { socketAuth, isValidCoord };
