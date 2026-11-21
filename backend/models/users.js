const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  rollNoOrPlate: { type: String, unique: true, required: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['driver', 'user', 'admin', 'security'], required: true },
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.statics.updatePasswordById = async function updatePasswordById(userId, newPassword) {
  const user = await this.findById(userId);
  if (!user) throw new Error('User not found');
  user.password = newPassword;
  await user.save(); // triggers the pre-save hash
  return user;
};

// Never send the password hash back to the client.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('user', userSchema);
