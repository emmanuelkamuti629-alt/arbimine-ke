const mongoose = require('mongoose');

const opportunitySchema = new mongoose.Schema({
  symbol: String,
  buyExchange: String,
  sellExchange: String,
  buyPrice: Number,
  sellPrice: Number,
  spread: String,
  tradable: Boolean,
  networks: [String],
  liquidityScore: Number,
  spreadHistory: [{ value: Number, timestamp: Date }],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Opportunity', opportunitySchema);
