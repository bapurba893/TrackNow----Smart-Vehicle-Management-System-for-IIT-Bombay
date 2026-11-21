const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const connectDB = require('./db');
const app = require('./app');
const initTrackingSocket = require('./socketserver/trackingSocket');
const initSecuritySocket = require('./socketserver/securitySocket');
const startAutoRedListJob = require('./jobs/cron');

async function main() {
  await connectDB(config.mongoUrl);

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: config.corsOrigins, methods: ['GET', 'POST'], credentials: true },
  });

  initTrackingSocket(io);
  initSecuritySocket(io);
  startAutoRedListJob();

  server.listen(config.port, () => console.log(`TrackNow API listening on port ${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
