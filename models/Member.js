const mongoose = require('mongoose');
const Counter = require('./Counter');

const MemberSchema = new mongoose.Schema({
  memberId: { type: String, unique: true }, // Auto-generated
  name: { type: String, required: true },
  mobile: { type: String, required: true },
  address: { type: String, required: true },
  nid: { type: String, required: true },
  joiningDate: { type: Date, required: true },
  monthlyDepositAmount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

// Pre-save hook to generate sequential memberId
MemberSchema.pre('save', async function (next) {
  if (!this.memberId) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { id: 'memberId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.memberId = counter.seq.toString();
    } catch (error) {
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('Member', MemberSchema);
