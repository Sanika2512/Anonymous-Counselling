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
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    feedback: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
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
