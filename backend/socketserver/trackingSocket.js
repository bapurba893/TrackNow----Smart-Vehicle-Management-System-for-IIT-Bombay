// Public campus transport: drivers broadcast their position, students see
// drivers and can flag "I'm here" so drivers know where demand is.
const { socketAuth, isValidCoord } = require('./socketAuth');

function initTrackingSocket(io) {
  const trackingIO = io.of('/tracking');
  trackingIO.use(socketAuth);

  const activeDrivers = {}; // plate -> { lat, lng, socketId }
  const activeUsers = {}; // socketId -> { lat, lng }

  trackingIO.on('connection', (socket) => {
    const { role, rollNoOrPlate } = socket.data.user;

    // Send current state immediately so a fresh page isn't blank until the next move.
    socket.emit('driversUpdate', activeDrivers);
    socket.emit('usersUpdate', activeUsers);

    socket.on('driverLocation', ({ lat, lng } = {}) => {
      if (role !== 'driver' || !isValidCoord(lat, lng)) return;
      // Plate comes from the verified token, so nobody can impersonate a vehicle.
      activeDrivers[rollNoOrPlate] = { lat, lng, socketId: socket.id };
      trackingIO.emit('driversUpdate', activeDrivers);
    });

    socket.on('userLocation', ({ lat, lng } = {}) => {
      if (role !== 'user' || !isValidCoord(lat, lng)) return;
      activeUsers[socket.id] = { lat, lng };
      trackingIO.emit('usersUpdate', activeUsers);
    });

    socket.on('stopUserLocation', () => {
      delete activeUsers[socket.id];
      trackingIO.emit('usersUpdate', activeUsers);
    });

    socket.on('disconnect', () => {
      for (const plate of Object.keys(activeDrivers)) {
        if (activeDrivers[plate].socketId === socket.id) delete activeDrivers[plate];
      }
      delete activeUsers[socket.id];
      trackingIO.emit('driversUpdate', activeDrivers);
      trackingIO.emit('usersUpdate', activeUsers);
    });
  });
}

module.exports = initTrackingSocket;
