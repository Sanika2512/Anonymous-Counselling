const express = require("express");
const router = express.Router();
const Rating = require("../models/Rating");
const User = require("../models/User");
const { isLoggedIn } = require("../middleware/auth");

// ─── HELPER: Recalculate and save counselor rating stats ───
// Only called on first-time rating OR when we need to sync.
// For updates, we use the delta approach (much faster).
async function syncCounselorRating(counselorId) {
    const ratings = await Rating.find({ counselor: counselorId, websiteReview: false });
    const totalRatings = ratings.length;
    const sumRatings = ratings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRatings > 0 ? Math.round((sumRatings / totalRatings) * 10) / 10 : 0;

    await User.findByIdAndUpdate(counselorId, { totalRatings, sumRatings, rating: averageRating });
    return { totalRatings, sumRatings, averageRating };
}

/*
=====================================
POST /api/ratings/counselor
One rating per student per counselor.
Updates existing rating using delta math — no full recalculation.
=====================================
*/
router.post("/counselor", isLoggedIn, async (req, res) => {
    try {
        const { counselorId, rating } = req.body;
        const studentId = req.user._id;

        // Validate inputs
        if (!counselorId || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
        }

        const counselor = await User.findOne({ _id: counselorId, role: "counselor" });
        if (!counselor) {
            return res.status(404).json({ success: false, message: "Counselor not found" });
        }

        // Check if student already rated this counselor
        const existingRating = await Rating.findOne({
            student: studentId,
            counselor: counselorId,
            websiteReview: false
        });

        let totalRatings = counselor.totalRatings || 0;
        let sumRatings = counselor.sumRatings || 0;

        if (existingRating) {
            // ── UPDATE PATH: use delta math, no full recalculation ──
            const oldRating = existingRating.rating;
            const delta = rating - oldRating; // e.g. was 3, now 5 → delta = +2

            existingRating.rating = rating;
            await existingRating.save();

            sumRatings = sumRatings + delta;
            // totalRatings stays the same — same student, just updating
        } else {
            // ── NEW RATING PATH ──
            await Rating.create({
                student: studentId,
                counselor: counselorId,
                rating,
                websiteReview: false
            });

            totalRatings = totalRatings + 1;
            sumRatings = sumRatings + rating;
        }

        // Calculate new average
        const averageRating = totalRatings > 0
            ? Math.round((sumRatings / totalRatings) * 10) / 10
            : 0;

        // Save updated stats back to counselor document
        await User.findByIdAndUpdate(counselorId, {
            totalRatings,
            sumRatings,
            rating: averageRating
        });

        return res.json({
            success: true,
            message: existingRating ? "Rating updated" : "Rating submitted",
            isUpdate: !!existingRating,
            avgRating: averageRating,
            totalRatings
        });

    } catch (err) {
        // Handle race condition: duplicate key error (two simultaneous first-time ratings)
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: "Rating conflict. Please try again." });
        }
        console.error("Rating error:", err.message);
        return res.status(500).json({ success: false, message: "Error submitting rating" });
    }
});

/*
=====================================
GET /api/ratings/check/:counselorId
Check if student already rated + return their rating
=====================================
*/
router.get("/check/:counselorId", isLoggedIn, async (req, res) => {
    try {
        const existing = await Rating.findOne({
            student: req.user._id,
            counselor: req.params.counselorId,
            websiteReview: false
        });

        // Also fetch current average from counselor document (fast — single doc lookup)
        const counselor = await User.findById(req.params.counselorId, "rating totalRatings");

        return res.json({
            success: true,
            hasRated: !!existing,
            yourRating: existing?.rating || null,
            avgRating: counselor?.rating || 0,
            totalRatings: counselor?.totalRatings || 0
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/*
=====================================
GET /api/ratings/counselor/:counselorId
Get full rating stats for a counselor (for profile page)
=====================================
*/
router.get("/counselor/:counselorId", async (req, res) => {
    try {
        const counselor = await User.findById(
            req.params.counselorId,
            "firstName lastName rating totalRatings sumRatings"
        );
        if (!counselor) {
            return res.status(404).json({ success: false, message: "Counselor not found" });
        }

        // Build star distribution (1★ to 5★ counts) for display
        const distribution = await Rating.aggregate([
            {
                $match: {
                    counselor: counselor._id,
                    websiteReview: false
                }
            },
            {
                $group: {
                    _id: "$rating",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Format: { 1: 0, 2: 3, 3: 5, 4: 12, 5: 20 }
        const starDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        distribution.forEach(d => { starDistribution[d._id] = d.count; });

        return res.json({
            success: true,
            avgRating: counselor.rating || 0,
            totalRatings: counselor.totalRatings || 0,
            starDistribution
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/*
=====================================
POST /api/ratings/website
Website homepage review (one per user)
=====================================
*/
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

        // upsert: update if exists, create if not
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

/*
=====================================
GET /api/ratings/website/check
Must be BEFORE /website/:id to avoid route conflict
=====================================
*/
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

/*
=====================================
GET /api/ratings/website
Get all homepage reviews
=====================================
*/
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

/*
=====================================
PUT /api/ratings/website/:id
Edit own homepage review
=====================================
*/
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

/*
=====================================
DELETE /api/ratings/website/:id
Delete own homepage review
=====================================
*/
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

/*
=====================================
POST /api/ratings/sync/:counselorId  (Admin utility)
Force-recalculate from all records if stats drift
=====================================
*/
router.post("/sync/:counselorId", isLoggedIn, async (req, res) => {
    try {
        const result = await syncCounselorRating(req.params.counselorId);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;