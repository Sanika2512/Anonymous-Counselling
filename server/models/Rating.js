const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    counselor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    // In your User model, add these fields:
rating: {
    type: Number,
    default: 0,
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
    // For homepage website review
    websiteReview: {
        type: Boolean,
        default: false
    },
    reviewText: {
        type: String,
        default: ""
    }
}, { timestamps: true });

// One student can rate one counselor only once
ratingSchema.index({ student: 1, counselor: 1 }, { unique: true });

module.exports = mongoose.model("Rating", ratingSchema);
