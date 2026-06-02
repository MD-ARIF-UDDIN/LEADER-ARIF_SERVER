const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  seq: { type: Number, default: 1000 }
});

module.exports = mongoose.model('Counter', CounterSchema);
