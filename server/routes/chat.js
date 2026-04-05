const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Chat = require("../models/Chat");
const User = require("../models/User");
const { isLoggedIn } = require("../middleware/auth");

// ✅ Gemini setup — FREE alternative to OpenAI
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const AI_SYSTEM_PROMPT = `You are a compassionate, professional anonymous counselling assistant for students.
Your role is to:
- Listen empathetically and without judgment
- Provide emotional support, coping strategies, and mental health guidance
- Help students manage stress, anxiety, academic pressure, relationships, and personal challenges
- Ask gentle follow-up questions to better understand their situation
- Keep responses warm and concise (2–4 sentences unless more detail is genuinely needed)
- If someone seems in immediate danger, always direct them to emergency services or a crisis helpline
- Never diagnose medical conditions or replace a licensed professional
- Never reveal or store any personal information`;

// ✅ Defined ONCE at the top
function getDeterministicAnonymousId(studentId) {
    const hash = studentId.toString().slice(-4);
    return "Student-" + (parseInt(hash, 16) % 1000);
}

/*
=====================================
⚠️  STATIC ROUTES FIRST — BEFORE /:chatId wildcard
=====================================
*/

/* AI CHATBOT PAGE — GET /api/chat/chatbot */
router.get("/chatbot", (req, res) => {
    res.render("chatbot");
});

/* AI CHATBOT API — POST /api/chat/ai */
router.post("/ai", async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                success: false,
                message: "messages array is required"
            });
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: AI_SYSTEM_PROMPT
        });

        const recentMessages = messages.slice(-20);

        // Convert to Gemini format — roles must be "user" or "model"
        const history = recentMessages.slice(0, -1).map(msg => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
        }));

        const chat = model.startChat({ history });

        // Send the last message
        const lastMsg = recentMessages[recentMessages.length - 1];
        const result = await chat.sendMessage(lastMsg.content);
        const reply = result.response.text();

        return res.json({ success: true, reply });

    } catch (err) {
        console.error("AI chat error:", err.message);
        return res.status(500).json({
            success: false,
            message: "AI service error. Please try again."
        });
    }
});

/*
=====================================
START CHAT
POST /api/chat/start
=====================================
*/
router.post("/start", isLoggedIn, async (req, res) => {
    try {
        const { counselorId } = req.body;
        const studentId = req.user._id;
        const deterministicAnonymousId = getDeterministicAnonymousId(studentId);

        const counselor = await User.findOne({ _id: counselorId, role: "counselor" });
        if (!counselor) {
            return res.status(404).json({ success: false, message: "Counselor not found" });
        }

        const existingChats = await Chat.find({
            student: studentId,
            counselor: counselorId
        }).sort({ createdAt: -1 });

        let chat;
        if (existingChats.length === 0) {
            chat = new Chat({
                student: studentId,
                counselor: counselorId,
                studentAnonymousId: deterministicAnonymousId,
                messages: [],
                status: "active",
                lastMessage: { text: "Chat started", timestamp: new Date(), sender: "system" },
                unreadCount: { student: 0, counselor: 1 }
            });
            await chat.save();

            const io = req.app.get("io");
            if (io) {
                io.to(counselorId.toString()).emit("newChat", {
                    chatId: chat._id,
                    anonymousId: deterministicAnonymousId,
                    timestamp: new Date()
                });
            }
        } else {
            chat = existingChats[0];
            const otherChatIds = existingChats.slice(1).map(c => c._id);
            if (otherChatIds.length > 0) {
                await Chat.updateMany(
                    { _id: { $in: otherChatIds } },
                    { $set: { status: "closed", studentAnonymousId: deterministicAnonymousId } }
                );
            }
            if (chat.studentAnonymousId !== deterministicAnonymousId || chat.status !== "active") {
                chat.studentAnonymousId = deterministicAnonymousId;
                chat.status = "active";
                await chat.save();
            }
        }

        if (chat.studentAnonymousId !== deterministicAnonymousId) {
            chat.studentAnonymousId = deterministicAnonymousId;
            await chat.save();
        }

        res.json({ success: true, chatId: chat._id, anonymousId: chat.studentAnonymousId });

    } catch (err) {
        console.error("Chat start error:", err);
        res.status(500).json({ success: false, message: "Unable to start chat" });
    }
});

/*
=====================================
GET ALL CHATS FOR USER
GET /api/chat
=====================================
*/
router.get("/", isLoggedIn, async (req, res) => {
    try {
        let query = {};
        if (req.user.role === "student") {
            query.student = req.user._id;
        } else {
            query.counselor = req.user._id;
        }

        const chats = await Chat.find(query)
            .populate("counselor", "firstName lastName profilePhoto isOnline specialization")
            .sort({ updatedAt: -1 });

        const uniqueMap = new Map();
        chats.forEach(chat => {
            const key = req.user.role === "student" ? chat.counselor.toString() : chat.student.toString();
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, chat);
                return;
            }
            const existing = uniqueMap.get(key);
            if (existing.status !== "active" && chat.status === "active") {
                uniqueMap.set(key, chat);
            }
        });

        const dedupedChats = Array.from(uniqueMap.values())
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        const formattedChats = dedupedChats.map(chat => {
            const lastMessage = chat.messages.length > 0
                ? chat.messages[chat.messages.length - 1]
                : { text: "No messages yet", timestamp: chat.createdAt };
            return {
                _id: chat._id,
                anonymousId: getDeterministicAnonymousId(chat.student),
                lastMessage: lastMessage.text,
                lastMessageTime: lastMessage.timestamp,
                status: chat.status,
                unreadCount: req.user.role === "counselor"
                    ? (chat.unreadCount?.counselor || 0)
                    : (chat.unreadCount?.student || 0),
                counselor: chat.counselor,
                createdAt: chat.createdAt
            };
        });

        res.json({ success: true, chats: formattedChats });

    } catch (err) {
        console.error("Get chats error:", err);
        res.status(500).json({ success: false, message: "Error loading chats" });
    }
});

/*
=====================================
⚠️  WILDCARD ROUTES LAST
=====================================
*/

/* GET SINGLE CHAT — GET /api/chat/:chatId */
router.get("/:chatId", isLoggedIn, async (req, res) => {
    try {
        const chatId = req.params.chatId;
        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({ success: false, message: "Invalid chat ID" });
        }

        const chat = await Chat.findById(chatId)
            .populate("counselor", "firstName lastName profilePhoto isOnline specialization");
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        const studentId     = chat.student?.toString();
        const counselorId   = chat.counselor?._id?.toString();
        const requestUserId = req.user._id.toString();
        const isStudent     = studentId === requestUserId;
        const isCounselor   = counselorId === requestUserId;

        if (!isStudent && !isCounselor) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        return res.json({
            success: true,
            chat: {
                _id: chat._id,
                studentAnonymousId: getDeterministicAnonymousId(chat.student),
                messages: chat.messages || [],
                status: chat.status,
                counselor: chat.counselor,
                createdAt: chat.createdAt
            }
        });

    } catch (err) {
        console.error("GET /api/chat/:chatId error:", err.message);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

/* SEND MESSAGE — POST /api/chat/:chatId/message */
router.post("/:chatId/message", isLoggedIn, async (req, res) => {
    try {
        const { text } = req.body;
        const chatId = req.params.chatId;

        if (!text || text.trim() === "") {
            return res.status(400).json({ success: false, message: "Message cannot be empty" });
        }

        const chat = await Chat.findById(chatId);
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        const isStudent  = chat.student.toString()  === req.user._id.toString();
        const isCounselor = chat.counselor.toString() === req.user._id.toString();
        if (!isStudent && !isCounselor) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        if (chat.status !== "active") {
            return res.status(400).json({ success: false, message: "This chat is closed" });
        }

        const senderRole = req.user.role;
        const message = {
            _id: new mongoose.Types.ObjectId(),
            sender: senderRole,
            senderId: req.user._id,
            text: text.trim(),
            timestamp: new Date(),
            readBy: [req.user._id],
            edited: false,
            deletedForAll: false,
            deletedFor: []
        };

        if (req.body.replyTo) {
            const parentMsg = chat.messages.id(req.body.replyTo);
            if (parentMsg) {
                message.replyTo = {
                    messageId: parentMsg._id,
                    text: parentMsg.text?.substring(0, 100) || ''
                };
            }
        }

        chat.messages.push(message);
        chat.lastMessage = { text: text.trim(), timestamp: message.timestamp, sender: senderRole };

        if (!chat.unreadCount) chat.unreadCount = { student: 0, counselor: 0 };
        if (senderRole === "student") {
            chat.unreadCount.counselor = (chat.unreadCount.counselor || 0) + 1;
            chat.unreadCount.student = 0;
        } else {
            chat.unreadCount.student = (chat.unreadCount.student || 0) + 1;
            chat.unreadCount.counselor = 0;
        }

        await chat.save();

const io = req.app.get("io");
if (io) {
    const messagePayload = {
        _id: message._id,
        sender: senderRole,
        senderId: req.user._id,
        text: text.trim(),
        timestamp: message.timestamp,
        chatId: chatId,
        replyTo: message.replyTo || null,
        edited: false
    };

    
    io.to(chatId.toString()).emit("newMessage", messagePayload);

    const otherUserId = senderRole === "student"
        ? chat.counselor.toString()
        : chat.student.toString();

    
   
    io.to(otherUserId).emit("newMessage", messagePayload);

    
    io.to(otherUserId).emit("conversationUpdated", {
        chatId: chatId,
        lastMessage: text.trim(),
        timestamp: message.timestamp,
        unreadCount: senderRole === "student"
            ? chat.unreadCount.counselor
            : chat.unreadCount.student
    });
    io.to(otherUserId).emit("refreshConversations");
}
  res.json({
            success: true,
            message: {
                _id: message._id,
                sender: senderRole,
                text: text.trim(),
                timestamp: message.timestamp
            }
        });

    } catch (err) {
        console.error("Send message error:", err);
        res.status(500).json({ success: false, message: "Error sending message" });
    }
});

/* MARK AS READ — POST /api/chat/:chatId/read */
router.post("/:chatId/read", isLoggedIn, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        if (req.user.role === "counselor") {
            chat.unreadCount.counselor = 0;
        } else {
            chat.unreadCount.student = 0;
        }

        chat.messages.forEach(msg => {
            if (!msg.readBy) msg.readBy = [];
            if (!msg.readBy.includes(req.user._id)) msg.readBy.push(req.user._id);
        });

        await chat.save();
        res.json({ success: true, message: "Messages marked as read" });

    } catch (err) {
        console.error("Mark read error:", err);
        res.status(500).json({ success: false, message: "Error marking messages as read" });
    }
});

/* EDIT MESSAGE — PUT /api/chat/:chatId/message/:messageId */
router.put("/:chatId/message/:messageId", isLoggedIn, async (req, res) => {
    try {
        const { text } = req.body;
        const chat = await Chat.findById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        const msg = chat.messages.id(req.params.messageId);
        if (!msg) return res.status(404).json({ success: false, message: "Message not found" });

        if (msg.senderId?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Can only edit your own messages" });
        }

        msg.text = text.trim();
        msg.edited = true;
        await chat.save();

        const io = req.app.get("io");
        if (io) {
            io.to(req.params.chatId).emit("messageEdited", {
                chatId: req.params.chatId,
                messageId: req.params.messageId,
                newText: text.trim()
            });
        }

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/* DELETE MESSAGE — DELETE /api/chat/:chatId/message/:messageId */
router.delete("/:chatId/message/:messageId", isLoggedIn, async (req, res) => {
    try {
        const { deleteFor } = req.body;
        const chat = await Chat.findById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        const msgIndex = chat.messages.findIndex(m => m._id.toString() === req.params.messageId);
        if (msgIndex === -1) return res.status(404).json({ success: false, message: "Message not found" });

        const msg = chat.messages[msgIndex];
        if (deleteFor === "all") {
            if (msg.senderId?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, message: "Can only delete your own messages for all" });
            }
            msg.deletedForAll = true;
            msg.text = "This message was deleted";
        } else {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.map(String).includes(req.user._id.toString())) {
                msg.deletedFor.push(req.user._id);
            }
        }

        await chat.save();

        const io = req.app.get("io");
        if (io && deleteFor === "all") {
            io.to(req.params.chatId).emit("messageDeleted", {
                chatId: req.params.chatId,
                messageId: req.params.messageId
            });
        }

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/* UPDATE CHAT STATUS — PUT /api/chat/:chatId/status */
router.put("/:chatId/status", isLoggedIn, async (req, res) => {
    try {
        const { status } = req.body;
        const chat = await Chat.findById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        if (chat.counselor.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        chat.status = status;
        chat.updatedAt = new Date();
        await chat.save();
        res.json({ success: true, message: `Chat marked as ${status}` });

    } catch (err) {
        console.error("Update chat status error:", err);
        res.status(500).json({ success: false, message: "Error updating chat status" });
    }
});

/* CLEAR CHAT — POST /api/chat/:chatId/clear */
router.post("/:chatId/clear", isLoggedIn, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        const isParticipant =
            chat.student.toString()  === req.user._id.toString() ||
            chat.counselor.toString() === req.user._id.toString();
        if (!isParticipant) return res.status(403).json({ success: false });

        chat.messages = [];
        chat.lastMessage = { text: "Chat cleared", timestamp: new Date(), sender: "system" };
        await chat.save();

        const io = req.app.get("io");
        if (io) io.to(req.params.chatId).emit("chatCleared", { chatId: req.params.chatId });

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/* DELETE ENTIRE CHAT — DELETE /api/chat/:chatId */
router.delete("/:chatId", isLoggedIn, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        const isParticipant =
            chat.student.toString()  === req.user._id.toString() ||
            chat.counselor.toString() === req.user._id.toString();
        if (!isParticipant) return res.status(403).json({ success: false });

        await Chat.findByIdAndDelete(req.params.chatId);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
