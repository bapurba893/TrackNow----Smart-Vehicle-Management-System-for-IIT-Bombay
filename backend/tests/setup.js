process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
process.env.SECURITY_SIGNUP_CODE = 'GATE-2025';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo;
const start = async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
};
const stop = async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
};
const reset = async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
};
module.exports = { start, stop, reset };
