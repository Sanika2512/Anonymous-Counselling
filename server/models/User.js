const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose").default;

const UserSchema = new mongoose.Schema({
  // LOGIN DATA
  email: {
    type: String,
    required: true,
    unique: true
  },

  role: {
    type: String,
    enum: ["student", "counselor"],
    default: "student"
  },

  // REALTIME STATUS
  isOnline: {
    type: Boolean,
    default: false
  },

  socketId: {
    type: String
  },

  lastSeen: {
    type: Date
  },

  // PROFILE DATA (NEW)
  profilePhoto: {
    type: String,
    default: "/images/default-profile.png"   // keep default image in public/images
  },

  firstName: {
    type: String
  },

  lastName: {
    type: String
  },

  specialization: {
    type: String   // only for counselor
  },

  education: {
    type: String   // only for counselor
  },
rating: {
  type: Number,
  default: 4.0,
  min: 0,
  max: 5
},

totalReviews: {
  type: Number,
  default: 0
},
  bio: {
    type: String   // optional description
  },
  anonymous_id: {
  type: String,
  default: null
},

  createdAt: {
    type: Date,
    default: Date.now
  }

});

// tell passport to use email instead of username
UserSchema.plugin(passportLocalMongoose, {
  usernameField: "email"
});

module.exports = mongoose.model("User", UserSchema);