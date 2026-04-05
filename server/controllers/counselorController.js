const User = require('../models/User');
const Issue = require('../models/Issue');


// @desc    Get all online counselors
// @route   GET /api/counselors/online
exports.getOnlineCounselors = async (req, res) => {
    try {
        const onlineCounselors = await User.find({ 
            role: 'counselor', 
            isOnline: true 
        }).select('username profile isOnline lastSeen socketId');
        
        // Get current workload for each counselor
        const counselorsWithWorkload = await Promise.all(
            onlineCounselors.map(async (counselor) => {
                const activeIssues = await Issue.countDocuments({
                    counselorId: counselor._id,
                    status: { $in: ['open', 'in-progress'] }
                });
                
                return {
                    ...counselor.toObject(),
                    activeIssues,
                    available: activeIssues < 5 // Max 5 active issues per counselor
                };
            })
        );
        
        res.json({
            success: true,
            counselors: counselorsWithWorkload
        });
    } catch (error) {
        console.error('Get online counselors error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Assign issue to specific counselor
// @route   POST /api/counselors/assign
exports.assignCounselor = async (req, res) => {
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
        
       const Chat = require("../models/Chat"); // top la add kar if not added

// 🔥 ADD THIS BLOCK
const chat = await Chat.findOne({ student: issue.studentId, counselor: counselorId });

if (chat) {
    chat.messages.push({
        sender: "system",
        text: `👋 Counselor ${counselor.username} has been assigned to help you.`,
        timestamp: new Date()
    });

    await chat.save();
}


     
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
};

// @desc    Auto-assign best available counselor
// @route   POST /api/counselors/auto-assign
exports.autoAssignCounselor = async (req, res) => {
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
};