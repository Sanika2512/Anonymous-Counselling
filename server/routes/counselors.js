const express = require('express');
const router = express.Router();
const upload = require("../config/multer");
const User = require('../models/User');
const Issue = require('../models/Issue');
const { isLoggedIn } = require('../middleware/auth');


// profile save route
  router.post("/profile", upload.single("profilePhoto"), async (req, res) => {
  try {
    const userId = req.user._id; // passport user

    let updateData = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      specialization: req.body.specialization,
      education: req.body.education,
      bio: req.body.bio
    };

    if (req.file) {
      updateData.profilePhoto = req.file.filename; // ONLY filename
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      user: updatedUser
    });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});



 // GET online counselors
  // GET online counselors
router.get("/online", async (req, res) => {
    try {
        const counselors = await User.find({
            role: "counselor",
            isOnline: true
        }).select("firstName lastName profilePhoto specialization education qualification skills isOnline rating totalRatings totalReviews lastSeen");

        res.json({
            success: true,
            counselors: counselors.map(c => ({
                ...c.toObject(),
                profilePhoto: c.profilePhoto || "default.png"
            }))
        });
    } catch (err) {
        console.log(err);
        res.json({ success: false, counselors: [] });
    }
});

function toArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value).split(",").map(item => item.trim()).filter(Boolean);
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatCounselor(c) {
    const obj = c.toObject ? c.toObject() : c;
    return {
        ...obj,
        profilePhoto: obj.profilePhoto || "default.png",
        totalRatings: obj.totalRatings || obj.totalReviews || 0,
        rating: obj.rating || 0,
        statusLabel: obj.isOnline
            ? "Online Now"
            : (obj.lastSeen && new Date(obj.lastSeen).toDateString() === new Date().toDateString() ? "Away" : "Offline")
    };
}

// GET ALL COUNSELORS (search + filters + sorting + pagination)
router.get('/all', isLoggedIn, async (req, res) => {
    try {
        const {
            search = "",
            availability = "",
            minRating = "",
            sort = "online",
            page = 1,
            limit = 12
        } = req.query;
        const educations = toArray(req.query.education);
        const specializations = toArray(req.query.specialization);
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);
        const numericPage = Math.max(parseInt(page, 10) || 1, 1);
        const query = { role: "counselor" };

        const trimmedSearch = String(search || "").trim();
        if (trimmedSearch) {
            const regex = new RegExp(escapeRegex(trimmedSearch), "i");
            query.$or = [
                { firstName: regex },
                { lastName: regex },
                { username: regex },
                { email: regex },
                { qualification: regex },
                { education: regex },
                { specialization: regex },
                { skills: regex },
                { bio: regex }
            ];
        }

        if (educations.length) {
            query.education = { $in: educations.map(item => new RegExp(`^${escapeRegex(item)}$`, "i")) };
        }

        if (specializations.length) {
            query.specialization = { $in: specializations.map(item => new RegExp(escapeRegex(item), "i")) };
        }

        if (minRating) {
            query.rating = { $gte: Number(minRating) };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (availability === "online") {
            query.isOnline = true;
        } else if (availability === "offline") {
            query.isOnline = { $ne: true };
        } else if (availability === "availableNow" || availability === "busy") {
            query.isOnline = true;
        } else if (availability === "today") {
            const searchOr = query.$or;
            delete query.$or;
            query.$and = [
                ...(searchOr ? [{ $or: searchOr }] : []),
                { $or: [{ isOnline: true }, { lastSeen: { $gte: today } }] }
            ];
        }

        const sortOptions = {
            highestRated: { rating: -1, totalRatings: -1, isOnline: -1 },
            lowestRated: { rating: 1, totalRatings: -1, isOnline: -1 },
            mostReviewed: { totalRatings: -1, totalReviews: -1, rating: -1 },
            mostExperienced: { totalRatings: -1, totalReviews: -1, rating: -1 },
            newestAdded: { createdAt: -1 },
            recentlyActive: { lastSeen: -1, isOnline: -1 },
            online: { isOnline: -1, lastSeen: -1, rating: -1 },
            onlineFirst: { isOnline: -1, lastSeen: -1, rating: -1 }
        };
        const sortBy = sortOptions[sort] || sortOptions.online;

        const pipeline = [
            { $match: query },
            {
                $lookup: {
                    from: 'issues',
                    let: { counselorId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$counselorId', '$$counselorId'] },
                                        { $in: ['$status', ['open', 'in-progress']] }
                                    ]
                                }
                            }
                        },
                        { $count: 'count' }
                    ],
                    as: 'activeIssuesData'
                }
            },
            {
                $addFields: {
                    activeIssues: {
                        $ifNull: [{ $arrayElemAt: ['$activeIssuesData.count', 0] }, 0]
                    },
                    available: {
                        $lt: [{ $ifNull: [{ $arrayElemAt: ['$activeIssuesData.count', 0] }, 0] }, 5]
                    }
                }
            }
        ];

        if (availability === 'availableNow') {
            pipeline.push({ $match: { available: true } });
        } else if (availability === 'busy') {
            pipeline.push({ $match: { available: false } });
        }

        pipeline.push({ $project: {
            firstName: 1,
            lastName: 1,
            username: 1,
            profilePhoto: 1,
            specialization: 1,
            education: 1,
            qualification: 1,
            skills: 1,
            rating: 1,
            totalRatings: 1,
            totalReviews: 1,
            isOnline: 1,
            lastSeen: 1,
            bio: 1,
            createdAt: 1,
            activeIssues: 1,
            available: 1
        } });

        const countPipeline = [...pipeline].filter(stage => !('$sort' in stage) && !('$skip' in stage) && !('$limit' in stage));
        countPipeline.push({ $count: 'total' });

        const [counselors, countResult] = await Promise.all([
            User.aggregate([...pipeline, { $sort: sortBy }, { $skip: (numericPage - 1) * numericLimit }, { $limit: numericLimit }]),
            User.aggregate(countPipeline)
        ]);

        const total = countResult[0]?.total || 0;

        res.json({
            success: true,
            counselors: counselors.map(formatCounselor),
            pagination: {
                page: numericPage,
                limit: numericLimit,
                total,
                hasMore: numericPage * numericLimit < total
            }
        });
    } catch (err) {
        console.error('Get all counselors error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/counselors/status/:issueId


// @route   GET /api/counselors/status/:issueId
router.get('/status/:issueId', isLoggedIn, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.issueId)
            .populate('counselorId', 'username isOnline');
        
        if (!issue) {
            return res.status(404).json({
                success: false,
                message: 'Issue not found'
            });
        }

        // Check if any counselor is online
        const anyCounselorOnline = await User.exists({ 
            role: 'counselor', 
            isOnline: true 
        });

        res.json({
            success: true,
            anyCounselorOnline: !!anyCounselorOnline,
            assignedCounselor: issue.counselorId ? {
                id: issue.counselorId._id,
                username: issue.counselorId.username,
                isOnline: issue.counselorId.isOnline
            } : null
        });
    } catch (error) {
        console.error('Get counselor status error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @desc    Assign issue to specific counselor
// @route   POST /api/counselors/assign
router.post('/assign', isLoggedIn, async (req, res) => {
    try {
        const { issueId, counselorId } = req.body;
        
        const issue = await Issue.findById(issueId);
        if (!issue) {
            return res.status(404).json({
                success: false,
                message: 'Issue not found'
            });
        }
        
        // Check if counselor exists and is online
        const counselor = await User.findOne({
            _id: counselorId,
            role: 'counselor',
            isOnline: true
        });
        
        if (!counselor) {
            return res.status(400).json({
                success: false,
                message: 'Counselor not available'
            });
        }
        
        // Update issue with counselor
        issue.counselorId = counselorId;
        issue.status = 'in-progress';
        await issue.save();
        
        // Create system message
        await Message.create({
            issueId,
            senderId: counselorId,
            senderRole: 'system',
            content: `👋 Counselor ${counselor.username} has been assigned to help you. They are now online and ready to chat.`,
            isAutoReply: true
        });
        
        // Get updated issue with populated data
        await issue.populate('counselorId', 'username profile isOnline');
        await issue.populate('studentId', 'username');
        
        // Emit via socket
        const io = req.app.get('io');
        io.to(issueId).emit('counselor-assigned', {
            issueId,
            counselor: {
                id: counselor._id,
                username: counselor.username,
                isOnline: true
            }
        });
        
        // Notify other counselors that this issue is taken
        io.emit('issue-assigned', {
            issueId,
            counselorId: counselor._id
        });
        
        res.json({
            success: true,
            issue
        });
    } catch (error) {
        console.error('Assign counselor error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @desc    Auto-assign best available counselor
// @route   POST /api/counselors/auto-assign
router.post('/auto-assign', isLoggedIn, async (req, res) => {
    try {
        const { issueId } = req.body;
        
        const issue = await Issue.findById(issueId);
        if (!issue) {
            return res.status(404).json({
                success: false,
                message: 'Issue not found'
            });
        }
        
        // Find best available counselor (least workload, online)
        const bestCounselor = await User.aggregate([
            { $match: { role: 'counselor', isOnline: true } },
            {
                $lookup: {
                    from: 'issues',
                    let: { counselorId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$counselorId', '$$counselorId'] },
                                        { $in: ['$status', ['open', 'in-progress']] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'activeIssues'
                }
            },
            {
                $addFields: {
                    workload: { $size: '$activeIssues' }
                }
            },
            { $sort: { workload: 1 } },
            { $limit: 1 }
        ]);
        
        if (bestCounselor.length === 0) {
            return res.json({
                success: true,
                assigned: false,
                message: 'No counselors available'
            });
        }
        
        const counselor = bestCounselor[0];
        
        // Assign issue
        issue.counselorId = counselor._id;
        issue.status = 'in-progress';
        await issue.save();
        
        // Create system message
        await Message.create({
            issueId,
            senderId: counselor._id,
            senderRole: 'system',
            content: `👋 A counselor has been automatically assigned to help you. They'll be with you shortly.`,
            isAutoReply: true
        });
        
        await issue.populate('counselorId', 'username profile isOnline');
        
        // Emit via socket
        const io = req.app.get('io');
        io.to(issueId).emit('counselor-assigned', {
            issueId,
            counselor: {
                id: counselor._id,
                username: counselor.username,
                isOnline: true
            }
        });
        
        res.json({
            success: true,
            assigned: true,
            issue,
            counselor: {
                id: counselor._id,
                username: counselor.username,
                workload: counselor.workload
            }
        });
    } catch (error) {
        console.error('Auto assign error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
