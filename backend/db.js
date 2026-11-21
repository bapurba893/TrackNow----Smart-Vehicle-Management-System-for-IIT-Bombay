const mongoose = require('mongoose');

const connectDB = async (url) => {
  mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  await mongoose.connect(url);
  console.log('Connected to MongoDB');
  return mongoose.connection;
};

module.exports = connectDB;
