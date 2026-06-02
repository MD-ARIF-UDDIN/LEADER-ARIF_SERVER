const mongoose = require('mongoose');

const DepositSchema = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  month: { type: String, required: true }, // Format: "YYYY-MM"
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Deposit', DepositSchema);
