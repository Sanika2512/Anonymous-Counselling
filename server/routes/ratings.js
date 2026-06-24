const express = require("express");
const router = express.Router();
const Rating = require("../models/Rating");
const User = require("../models/User");
const { isLoggedIn } = require("../middleware/auth");

async function syncCounselorRating(counselorId) {
    const ratings = await Rating.find({ counselor: counselorId, websiteReview: false });
    const totalRatings = ratings.length;
    const sumRatings = ratings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRatings > 0 ? Math.round((sumRatings / totalRatings) * 10) / 10 : 0;

    await User.findByIdAndUpdate(counselorId, {
        totalRatings,
        totalReviews: totalRatings,
        sumRatings,
        rating: averageRating
    });

    return { totalRatings, sumRatings, averageRating };
}

router.post("/counselor", isLoggedIn, async (req, res) => {
    try {
        const { counselorId, rating, feedback = "" } = req.body;
        const studentId = req.user._id;
        const numericRating = Number(rating);

        if (!counselorId || !numericRating || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
        }

        const counselor = await User.findOne({ _id: counselorId, role: "counselor" });
        if (!counselor) {
            return res.status(404).json({ success: false, message: "Counselor not found" });
        }

        const existingRating = await Rating.findOne({
            student: studentId,
            counselor: counselorId,
            websiteReview: false
        });

        if (existingRating) {
            return res.status(409).json({
                success: false,
                hasRated: true,
                message: "You have already rated this counselor"
            });
        }

        await Rating.create({
            student: studentId,
            counselor: counselorId,
            rating: numericRating,
            feedback: String(feedback || "").trim().slice(0, 1000),
            websiteReview: false
        });

        const totalRatings = (counselor.totalRatings || counselor.totalReviews || 0) + 1;
        const sumRatings = (counselor.sumRatings || 0) + numericRating;
        const averageRating = Math.round((sumRatings / totalRatings) * 10) / 10;

        await User.findByIdAndUpdate(counselorId, {
            totalRatings,
            totalReviews: totalRatings,
            sumRatings,
            rating: averageRating
        });

        const io = req.app.get("io");
        if (io) {
            const ratingPayload = {
                counselorId: counselorId.toString(),
                avgRating: averageRating,
                totalRatings
            };
            io.emit("counselor-rating-updated", ratingPayload);
            io.emit("counselor-list-update", ratingPayload);
        }

        return res.json({
            success: true,
            message: "Rating submitted",
            avgRating: averageRating,
            totalRatings
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                hasRated: true,
                message: "You have already rated this counselor"
            });
        }
        console.error("Rating error:", err.message);
        return res.status(500).json({ success: false, message: "Error submitting rating" });
    }
});

router.get("/check/:counselorId", isLoggedIn, async (req, res) => {
    try {
        const existing = await Rating.findOne({
            student: req.user._id,
            counselor: req.params.counselorId,
            websiteReview: false
        });

        const counselor = await User.findById(req.params.counselorId, "rating totalRatings totalReviews");

        return res.json({
            success: true,
            hasRated: !!existing,
            yourRating: existing?.rating || null,
            feedback: existing?.feedback || "",
            avgRating: counselor?.rating || 0,
            totalRatings: counselor?.totalRatings || counselor?.totalReviews || 0
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.get("/counselor/:counselorId", async (req, res) => {
    try {
        const counselor = await User.findById(
            req.params.counselorId,
            "firstName lastName rating totalRatings totalReviews sumRatings"
        );
        if (!counselor) {
            return res.status(404).json({ success: false, message: "Counselor not found" });
        }

        const distribution = await Rating.aggregate([
            { $match: { counselor: counselor._id, websiteReview: false } },
            { $group: { _id: "$rating", count: { $sum: 1 } } }
        ]);

        const starDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        distribution.forEach(d => { starDistribution[d._id] = d.count; });

        return res.json({
            success: true,
            avgRating: counselor.rating || 0,
            totalRatings: counselor.totalRatings || counselor.totalReviews || 0,
            starDistribution
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.post("/website", isLoggedIn, async (req, res) => {
    try {
        const { rating, reviewText } = req.body;
        const studentId = req.user._id;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "Invalid rating" });
        }
        if (!reviewText || !reviewText.trim()) {
            return res.status(400).json({ success: false, message: "Review text is required" });
        }

        await Rating.findOneAndUpdate(
            { student: studentId, counselor: studentId, websiteReview: true },
            { rating, reviewText: reviewText.trim() },
            { upsert: true, new: true }
        );

        return res.json({ success: true, message: "Review submitted, thank you!" });
    } catch (err) {
        console.error("Website review error:", err.message);
        return res.status(500).json({ success: false, message: "Error submitting review" });
    }
});

router.get("/website/check", isLoggedIn, async (req, res) => {
    try {
        const existing = await Rating.findOne({
            student: req.user._id,
            counselor: req.user._id,
            websiteReview: true
        });
        return res.json({
            success: true,
            hasReviewed: !!existing,
            rating: existing?.rating || null
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.get("/website", async (req, res) => {
    try {
        const reviews = await Rating.find({ websiteReview: true, reviewText: { $ne: "" } })
            .populate("student", "username _id")
            .sort({ createdAt: -1 })
            .limit(6);

        const formatted = reviews.map(r => ({
            _id: r._id,
            studentId: r.student?._id,
            username: r.student?.username || "Anonymous User",
            rating: r.rating,
            reviewText: r.reviewText,
            date: r.createdAt
        }));

        return res.json({ success: true, reviews: formatted });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.put("/website/:id", isLoggedIn, async (req, res) => {
    try {
        const { rating, reviewText } = req.body;
        const review = await Rating.findById(req.params.id);

        if (!review) return res.status(404).json({ success: false, message: "Review not found" });
        if (review.student.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        if (rating) review.rating = rating;
        if (reviewText) review.reviewText = reviewText.trim();
        await review.save();

        return res.json({ success: true, message: "Review updated" });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.delete("/website/:id", isLoggedIn, async (req, res) => {
    try {
        const review = await Rating.findById(req.params.id);
        if (!review) return res.status(404).json({ success: false, message: "Review not found" });
        if (review.student.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        await review.deleteOne();
        return res.json({ success: true, message: "Review deleted" });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.post("/sync/:counselorId", isLoggedIn, async (req, res) => {
    try {
        const result = await syncCounselorRating(req.params.counselorId);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
