const mongoose = require('mongoose');
const { PLATE_REGEX } = require('../utils/plate');

const VEHICLE_TYPES = ['private', 'auto', 'cab', 'bus', 'delivery', 'construction', 'other'];

// A visitor vehicle currently (or previously) holding a temporary pass.
const tempuserSchema = new mongoose.Schema({
  plate: { type: String, unique: true, required: true, trim: true, match: PLATE_REGEX },
  type: { type: String, required: true, enum: VEHICLE_TYPES },
  time: { type: Date, required: true },
  tilltime: { type: Date, required: true },
  status: { type: String, enum: ['temp', 'red'], required: true },
});

// Running tally of how many times a plate overstayed its pass.
const reduserSchema = new mongoose.Schema({
  plate: { type: String, unique: true, required: true, trim: true, match: PLATE_REGEX },
  count: { type: Number, default: 1, required: true },
  type: { type: String, required: true, enum: VEHICLE_TYPES },
});

const tempUser = mongoose.model('tempUser', tempuserSchema);
const redUser = mongoose.model('redUser', reduserSchema);

module.exports = { tempUser, redUser, VEHICLE_TYPES };
