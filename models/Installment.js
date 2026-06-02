const mongoose = require('mongoose');

const InstallmentSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  month: { type: String, required: true }, // Format: "YYYY-MM"
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Installment', InstallmentSchema);
