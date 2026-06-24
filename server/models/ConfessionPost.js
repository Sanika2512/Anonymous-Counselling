const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["image", "video", "audio", "attachment"],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  originalName: String,
  mimeType: String,
  size: Number
}, { _id: false });

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  reporterRole: {
    type: String,
    enum: ["student", "counselor", "admin", "super_admin"],
    required: true
  },
  reason: {
    type: String,
    enum: ["Harassment", "Bullying", "Abuse", "Hate Speech", "Threat", "Spam", "Self Harm Concern", "Other"],
    required: true
  },
  details: {
    type: String,
    trim: true,
    maxlength: 600
  },
  status: {
    type: String,
    enum: ["open", "dismissed", "actioned"],
    default: "open",
    index: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  reviewedAt: Date
}, { timestamps: true });

const replySchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  anonymousId: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2500
  },
  parentReply: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  role: {
    type: String,
    enum: ["student", "counselor"],
    required: true
  },
  isHelpfulAnswer: {
    type: Boolean,
    default: false
  },
  isCounselorRecommendation: {
    type: Boolean,
    default: false
  },
  editedAt: Date
}, { timestamps: true });

const reactionSchema = new mongoose.Schema({
  support: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  meToo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  helpful: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  stayStrong: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { _id: false });

const confessionPostSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  anonymousId: {
    type: String,
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: [
      "Placement Stress",
      "Internship Problems",
      "Exam Anxiety",
      "Family Issues",
      "Relationship Issues",
      "Mental Health",
      "Career Guidance",
      "College Life",
      "Motivation",
      "Other"
    ],
    default: "Other",
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 140
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  media: [mediaSchema],
  status: {
    type: String,
    enum: ["open", "resolved", "flagged", "hidden", "removed", "locked"],
    default: "open",
    index: true
  },
  moderationStatus: {
    type: String,
    enum: ["pending", "approved", "rejected", "removed", "locked", "hidden"],
    default: "pending",
    index: true
  },
  riskLevel: {
    type: String,
    enum: ["safe", "moderate", "high", "emergency"],
    default: "safe",
    index: true
  },
  moderationLabel: {
    type: String,
    enum: ["Safe", "Moderate Risk", "High Risk"],
    default: "Safe",
    index: true
  },
  sentiment: {
    type: String,
    enum: ["positive", "neutral", "distressed"],
    default: "neutral",
    index: true
  },
  moderation: {
    flagged: {
      type: Boolean,
      default: false,
      index: true
    },
    reasons: [String],
    reviewed: {
      type: Boolean,
      default: false
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    reviewedAt: Date,
    aiLabels: [String],
    emergency: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  reports: [reportSchema],
  recommendations: [String],
  reactions: {
    type: reactionSchema,
    default: () => ({ support: [], meToo: [], helpful: [], stayStrong: [] })
  },
  replies: [replySchema],
  savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

confessionPostSchema.index({ title: "text", description: "text" });
confessionPostSchema.index({ createdAt: -1 });
confessionPostSchema.index({ moderationStatus: 1, riskLevel: 1, createdAt: -1 });
confessionPostSchema.index({ "reports.status": 1, "reports.createdAt": -1 });
confessionPostSchema.index({ "replies.createdAt": -1 });
confessionPostSchema.index({ "reactions.helpful": 1 });

confessionPostSchema.virtual("replyCount").get(function() {
  return this.replies ? this.replies.length : 0;
});

confessionPostSchema.virtual("reportCount").get(function() {
  return this.reports ? this.reports.length : 0;
});

confessionPostSchema.set("toJSON", { virtuals: true });
confessionPostSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("ConfessionPost", confessionPostSchema);
