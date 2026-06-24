const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  targetType: {
    type: String,
    enum: ["post", "report", "user", "system"],
    default: "system",
    index: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  targetSnapshot: {
    anonymousId: String,
    category: String,
    moderationStatus: String,
    riskLevel: String
  },
  note: {
    type: String,
    trim: true,
    maxlength: 600
  }
}, { timestamps: true });

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
