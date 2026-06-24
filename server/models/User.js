const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose").default;

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  username: String,
  role: {
    type: String,
    enum: ["student", "counselor", "admin", "super_admin"],
    default: "student",
    index: true
  },
  accountStatus: {
    type: String,
    enum: ["active", "warned", "suspended", "permanently_suspended"],
    default: "active",
    index: true
  },
  warnings: [{
    reason: String,
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    issuedAt: {
      type: Date,
      default: Date.now
    }
  }],
  suspendedUntil: Date,
  isOnline: {
    type: Boolean,
    default: false
  },
  socketId: String,
  lastSeen: Date,
  profilePhoto: {
    type: String,
    default: "/images/default-profile.png"
  },
  firstName: String,
  lastName: String,
  qualification: String,
  specialization: String,
  education: String,
  skills: [String],
  rating: {
    type: Number,
    default: 4.0,
    min: 0,
    max: 5
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  sumRatings: {
    type: Number,
    default: 0
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  bio: String,
  anonymous_id: {
    type: String,
    default: null,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

UserSchema.plugin(passportLocalMongoose, {
  usernameField: "email"
});

module.exports = mongoose.model("User", UserSchema);
