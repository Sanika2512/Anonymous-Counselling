
const Issue = require('../models/Issue');
const User = require('../models/User');

// @desc    Get messages for an issue
// @route   GET /api/messages/:issueId
exports.getMessages = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const issue = await Issue.findById(req.params.issueId);
        if (!issue) {
            return res.status(404).json({
                success: false,
                message: 'Issue not found'
            });
        }

        // Check authorization
        if (req.user.role === 'student' && issue.studentId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        const messages = await Message.find({ issueId: req.params.issueId })
            .populate('senderId', 'username role profile isOnline')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Message.countDocuments({ issueId: req.params.issueId });

        // Mark messages as read
        if (req.user.role === 'counselor') {
            await Message.updateMany(
                { 
                    issueId: req.params.issueId, 
                    senderRole: 'student',
                    isRead: false 
                },
                { 
                    isRead: true,
                    $push: {
                        readBy: {
                            userId: req.user.id,
                            readAt: Date.now()
                        }
                    }
                }
            );
        }

        res.json({
            success: true,
            messages: messages.reverse(),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Send message
// @route   POST /api/messages
exports.sendMessage = async (req, res) => {
    try {
        const { issueId, content } = req.body;

        const issue = await Issue.findById(issueId);
        if (!issue) {
            return res.status(404).json({
                success: false,
                message: 'Issue not found'
            });
        }

        // Check authorization
        if (req.user.role === 'student' && issue.studentId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        // Create message
        const message = await Message.create({
            issueId,
            senderId: req.user.id,
            senderRole: req.user.role,
            content: content.trim()
        });

        // Update issue's last message time
        issue.lastMessageAt = Date.now();
        
        if (req.user.role === 'counselor' && issue.status === 'open') {
            issue.status = 'in-progress';
            issue.counselorId = req.user.id;
        }
        
        await issue.save();

        await message.populate('senderId', 'username role profile isOnline');

        // Check for counselor online status (if student is sending)
        if (req.user.role === 'student') {
            const onlineCounselor = await User.findOne({ 
                role: 'counselor', 
                isOnline: true 
            });

            if (!onlineCounselor) {
                // Generate chatbot response
                const botResponse = await generateChatbotResponse(content, issue.category);
                
                const botMessage = await Message.create({
                    issueId,
                    senderId: issue.studentId,
                    senderRole: 'system',
                    content: botResponse,
                    isAutoReply: true
                });

                await botMessage.populate('senderId', 'username role');

                // Emit bot message
                const io = req.app.get('io');
                io.to(issueId).emit('new-message', botMessage);
            }
        }

        // Emit message via socket
        const io = req.app.get('io');
        io.to(issueId).emit('new-message', message);

        // Notify counselors if message is from student
        if (req.user.role === 'student') {
            const counselors = await User.find({ role: 'counselor', isOnline: true });
            counselors.forEach(counselor => {
                if (counselor.socketId) {
                    io.to(counselor.socketId).emit('new-issue-message', {
                        issueId,
                        message,
                        issueTitle: issue.title
                    });
                }
            });
        }

        res.status(201).json({
            success: true,
            message
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Chatbot response generator
async function generateChatbotResponse(message, category) {
    const lowercaseMsg = message.toLowerCase();
    
    // Emergency detection
    if (lowercaseMsg.includes('suicide') || 
        lowercaseMsg.includes('kill myself') || 
        lowercaseMsg.includes('end my life') ||
        lowercaseMsg.includes('want to die')) {
        return `🚨 **I'm really concerned about what you're sharing.** 🚨

Your safety is the most important thing right now. Please reach out immediately:

📞 **988 Suicide & Crisis Lifeline**
Call or Text **988** (24/7)

📱 **Crisis Text Line**
Text **HOME** to **741741**

🏥 **Emergency Services**
Call **911** or go to nearest ER

**Are you safe right now?** A counselor will see your message as soon as possible.`;
    }

    if (lowercaseMsg.includes('panic') || lowercaseMsg.includes('anxiety attack')) {
        return `I hear that you're experiencing panic or anxiety. Let's try a quick grounding exercise together:

🌬️ **Take a deep breath in for 4 seconds**
Hold for 4 seconds
🌬️ **Breathe out slowly for 4 seconds**

Now, tell me 5 things you can see around you.
Tell me 4 things you can touch.
Tell me 3 things you can hear.
Tell me 2 things you can smell.
Tell me 1 thing you can taste.

**How are you feeling now?** A counselor will be with you soon.`;
    }

    // Category-based responses
    const responses = {
        'Academic': {
            keywords: ['exam', 'study', 'grade', 'class', 'homework', 'assignment', 'test'],
            response: `I understand academic stress can be overwhelming. Here are some quick tips:

📚 **Break it down**: Divide your work into smaller tasks
⏰ **Pomodoro Technique**: Study 25 mins, break 5 mins
🎯 **Prioritize**: Focus on one thing at a time
💤 **Rest**: Don't forget to take care of yourself

Would you like to tell me more about what's troubling you?`
        },
        'Career': {
            keywords: ['job', 'career', 'interview', 'resume', 'future', 'profession'],
            response: `Career uncertainty is completely normal. Let's explore this together:

💼 **Update your resume** - Focus on achievements
🤝 **Network** - Connect with professionals on LinkedIn
🎯 **Set small goals** - One step at a time
📚 **Learn** - Consider online courses

What specific aspect of your career is worrying you?`
        },
        'Family': {
            keywords: ['family', 'parent', 'home', 'sibling', 'fight', 'argument'],
            response: `Family issues can be really challenging. Here's what might help:

🏠 **Set boundaries** - It's okay to say no
💬 **Communicate** - Express your feelings calmly
🤗 **Self-care** - Take time for yourself
🆘 **Support** - You're not alone in this

Would you like to share more about your situation?`
        },
        'Mental Health': {
            keywords: ['anxiety', 'depression', 'stress', 'sad', 'lonely', 'overwhelmed', 'tired'],
            response: `Thank you for sharing how you're feeling. Your mental health matters:

🧠 **You're not alone** - Many students feel this way
🌱 **Small steps** - Even tiny progress counts
💚 **Self-compassion** - Be kind to yourself
🎨 **Express yourself** - Journal, art, or music

Can you tell me more about what's been going on?`
        }
    };

    // Check for category-specific keywords
    const categoryResponse = responses[category];
    if (categoryResponse) {
        for (const keyword of categoryResponse.keywords) {
            if (lowercaseMsg.includes(keyword)) {
                return categoryResponse.response;
            }
        }
    }

    // Default responses based on message type
    if (lowercaseMsg.includes('hello') || lowercaseMsg.includes('hi')) {
        return `Hello! 👋 I'm here to support you while you wait for a counselor.

You can tell me:
• What's been on your mind lately?
• How are you feeling right now?
• What would you like help with?

A real counselor will join this chat as soon as they're online.`;
    }

    if (lowercaseMsg.includes('thank')) {
        return "You're welcome! 😊 I'm glad I could help. A counselor will be with you soon to provide more support. Is there anything else you'd like to talk about in the meantime?";
    }

    if (lowercaseMsg.includes('help')) {
        return `I'm here to help! Here's what I can do:

💬 **Listen** to whatever you want to share
📝 **Provide coping strategies** for stress and anxiety
📞 **Share emergency resources** if you need them
🤝 **Guide you** to relevant information

What kind of support are you looking for right now?`;
    }

    if (lowercaseMsg.includes('sad') || lowercaseMsg.includes('depress')) {
        return `I'm sorry you're feeling this way. It takes courage to express these feelings.

🌧️ **It's okay to feel sad** - Emotions are valid
🌈 **This feeling will pass** - Nothing is permanent
🤗 **You matter** - Your feelings are important
💪 **You're strong** - Reaching out shows strength

Would you like to talk more about what's making you feel this way?`;
    }

    if (lowercaseMsg.includes('lonely')) {
        return `Feeling lonely can be really tough, especially as a student. 

🤝 **You're not alone** - Many students feel this way
🌍 **Connect** - Consider joining a student group
📱 **Reach out** - Text a friend or family member
💙 **Self-care** - Do something kind for yourself

What would help you feel more connected right now?`;
    }

    if (lowercaseMsg.includes('sleep') || lowercaseMsg.includes('insomnia')) {
        return `Sleep issues are common with stress. Here are some tips:

🌙 **Consistent schedule** - Same bedtime/wake time
📱 **No screens** - Put away devices 1 hour before bed
🧘 **Relaxation** - Try deep breathing or meditation
☕ **Avoid caffeine** - Especially in the evening

Would you like some guided relaxation techniques?`;
    }

    // Default response
    return `Thank you for sharing. I'm here to listen and support you.

🤔 **Can you tell me more about that?**
💭 **How does this make you feel?**
🎯 **What would help you right now?**

A counselor will see your messages and respond as soon as they're online. In the meantime, I'm here to chat.`;
}

// @desc    Get counselor online status
// @route   GET /api/messages/counselor-status/:issueId
exports.getCounselorStatus = async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.issueId);
        if (!issue) {
            return res.status(404).json({
                success: false,
                message: 'Issue not found'
            });
        }

        // Check if any counselor is online
        const onlineCounselor = await User.findOne({ 
            role: 'counselor', 
            isOnline: true 
        }).select('username isOnline lastSeen');

        // Check if this specific issue has an assigned counselor
        let assignedCounselor = null;
        if (issue.counselorId) {
            assignedCounselor = await User.findById(issue.counselorId)
                .select('username isOnline lastSeen');
        }

        res.json({
            success: true,
            anyCounselorOnline: !!onlineCounselor,
            assignedCounselor: assignedCounselor ? {
                id: assignedCounselor._id,
                username: assignedCounselor.username,
                isOnline: assignedCounselor.isOnline,
                lastSeen: assignedCounselor.lastSeen
            } : null
        });
    } catch (error) {
        console.error('Get counselor status error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};