const mongoose = require("mongoose");

const IssueSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  counselorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  title: String,
  category: String,
  description: String,
  status: {
    type: String,
    default: "open"
  },
  lastMessageAt: Date
}, { timestamps: true });

module.exports = mongoose.model("Issue", IssueSchema);