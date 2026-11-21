require('dotenv').config({ quiet: true });

const isTest = process.env.NODE_ENV === 'test';

const config = {
  port: Number(process.env.PORT) || 5001,
  mongoUrl: process.env.MONGO_URL,
  jwtSecret: process.env.JWT_SECRET,
  securitySignupCode: process.env.SECURITY_SIGNUP_CODE,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

// Fail fast instead of silently running with a missing or guessable secret.
if (!isTest) {
  if (!config.mongoUrl) throw new Error('MONGO_URL is not set. Copy backend/.env.example to backend/.env.');
  if (!config.jwtSecret || config.jwtSecret.length < 16) {
    throw new Error('JWT_SECRET must be set and at least 16 characters long.');
  }
}

module.exports = config;
