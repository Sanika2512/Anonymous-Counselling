const mongoose = require("mongoose");

const ModerationAlertSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ConfessionPost",
    required: true,
    index: true
  },
  anonymousId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ["ai_flag", "report", "emergency"],
    required: true,
    index: true
  },
  riskLevel: {
    type: String,
    enum: ["safe", "moderate", "high", "emergency"],
    default: "moderate",
    index: true
  },
  labels: [String],
  reason: String,
  status: {
    type: String,
    enum: ["open", "reviewing", "resolved", "dismissed"],
    default: "open",
    index: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  resolvedAt: Date
}, { timestamps: true });

ModerationAlertSchema.index({ status: 1, riskLevel: 1, createdAt: -1 });

module.exports = mongoose.model("ModerationAlert", ModerationAlertSchema);
