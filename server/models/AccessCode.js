// models/AccessCode.js
const mongoose = require("mongoose");

const accessCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true   
  },
  used: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model("AccessCode", accessCodeSchema);