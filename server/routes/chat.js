const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Chat = require("../models/Chat");
const User = require("../models/User");
const Rating = require("../models/Rating");
const { isLoggedIn } = require("../middleware/auth");
const { buildRecommendations } = require("../services/recommendationService");

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

async function buildRatingPrompt(chat, studentId) {
    if (!chat || chat.student.toString() !== studentId.toString()) return null;

    const exchangedCount = (chat.messages || []).filter(msg =>
        ["student", "counselor"].includes(msg.sender) && !msg.deletedForAll
    ).length;

    if (exchangedCount < 10) return null;

    const existingRating = await Rating.findOne({
        student: studentId,
        counselor: chat.counselor,
        websiteReview: false
    }).select("_id");

    if (existingRating) return null;

    return {
        shouldPrompt: true,
        counselorId: chat.counselor.toString(),
        messageCount: exchangedCount
    };
}

const voiceUploadDir = path.join(__dirname, "../../client/public/uploads/voice");
if (!fs.existsSync(voiceUploadDir)) {
    fs.mkdirSync(voiceUploadDir, { recursive: true });
}

const DELETE_FOR_EVERYONE_WINDOW_MS = 24 * 60 * 60 * 1000;

function mimeToExtension(mimeType) {
    const cleanType = String(mimeType || "").split(";")[0].toLowerCase();
    const map = {
        "audio/webm": ".webm",
        "audio/mp4": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/aac": ".aac",
        "audio/ogg": ".ogg",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/vnd.wave": ".wav"
    };
    return map[cleanType] || ".webm";
}

const voiceUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, voiceUploadDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || "").toLowerCase() || mimeToExtension(file.mimetype);
            cb(null, `voice-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        }
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const cleanType = String(file.mimetype || "").split(";")[0].toLowerCase();
        const allowed = [
            "audio/webm",
            "audio/mp4",
            "audio/x-m4a",
            "audio/aac",
            "audio/ogg",
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/x-wav",
            "audio/vnd.wave"
        ];
        if (allowed.includes(cleanType) || cleanType.startsWith("audio/")) return cb(null, true);
        cb(new Error("Unsupported audio format. Please record again and try sending."));
    }
});

function removeUploadedFile(file) {
    if (file?.path) fs.unlink(file.path, () => {});
}

function removeVoiceFileByMessage(message) {
    const filename = message?.voice?.filename;
    if (!filename) return;
    const resolvedPath = path.resolve(voiceUploadDir, path.basename(filename));
    if (!resolvedPath.startsWith(path.resolve(voiceUploadDir))) return;
    fs.unlink(resolvedPath, () => {});
}

function toId(value) {
    return value?._id ? value._id.toString() : value?.toString?.();
}

function idListIncludes(list, userId) {
    return Array.isArray(list) && list.some(id => toId(id) === userId.toString());
}

function getMessageType(message) {
    return message?.messageType || (message?.voice?.url ? "voice" : "text");
}

function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function getReplyPreview(message) {
    const messageType = getMessageType(message);
    if (message?.deletedForAll) {
        return {
            messageId: message._id,
            messageType,
            text: messageType === "voice" ? "Deleted Voice Message" : "Deleted Message",
            duration: message?.voice?.duration || 0,
            deletedForAll: true
        };
    }

    if (messageType === "voice") {
        const duration = Number(message?.voice?.duration || 0);
        return {
            messageId: message._id,
            messageType: "voice",
            text: `Voice Message (${formatDuration(duration)})`,
            duration,
            deletedForAll: false
        };
    }

    return {
        messageId: message._id,
        messageType: "text",
        text: (message?.text || "Message").substring(0, 100),
        duration: 0,
        deletedForAll: false
    };
}

function serializeMessage(message, chatId) {
    const obj = message?.toObject ? message.toObject() : message;
    const seenBy = obj.seenBy?.length ? obj.seenBy : (obj.readBy || []);
    return {
        _id: obj._id,
        sender: obj.sender,
        senderId: obj.senderId,
        text: obj.text || "",
        messageType: getMessageType(obj),
        voice: obj.deletedForAll ? null : (obj.voice || null),
        timestamp: obj.timestamp,
        chatId,
        replyTo: obj.replyTo || null,
        edited: !!obj.edited,
        deletedForAll: !!obj.deletedForAll,
        deletedAt: obj.deletedAt || null,
        deletedFor: obj.deletedFor || [],
        deliveredTo: obj.deliveredTo || [],
        seenBy,
        readBy: obj.readBy || seenBy
    };
}

function getVisibleMessages(chat, userId) {
    const viewerId = userId.toString();
    return (chat.messages || [])
        .filter(msg => !idListIncludes(msg.deletedFor, viewerId))
        .map(msg => serializeMessage(msg, chat._id.toString()));
}

function getLastVisibleMessage(chat, userId) {
    const viewerId = userId.toString();
    return [...(chat.messages || [])]
        .reverse()
        .find(msg => !msg.deletedForAll && !idListIncludes(msg.deletedFor, viewerId));
}

function getMessagePreviewText(message) {
    if (!message) return "No messages yet";
    if (message.deletedForAll) return "No messages yet";
    if (getMessageType(message) === "voice") return "Voice message";
    return message.text || "Message";
}

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
            const lastMessage = getLastVisibleMessage(chat, req.user._id) || { text: "No messages yet", timestamp: chat.createdAt };
            return {
                _id: chat._id,
                anonymousId: getDeterministicAnonymousId(chat.student),
                lastMessage: getMessagePreviewText(lastMessage),
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

        const ratingPrompt = await buildRatingPrompt(chat, chat.student);

        return res.json({
            success: true,
            chat: {
                _id: chat._id,
                studentAnonymousId: getDeterministicAnonymousId(chat.student),
                messages: getVisibleMessages(chat, req.user._id),
                status: chat.status,
                counselor: chat.counselor,
                createdAt: chat.createdAt
            },
            ratingPrompt
        });

    } catch (err) {
        console.error("GET /api/chat/:chatId error:", err.message);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

/* SEND MESSAGE — POST /api/chat/:chatId/message */
router.post("/:chatId/message", isLoggedIn, voiceUpload.single("voice"), async (req, res) => {
    try {
        const { text } = req.body;
        const chatId = req.params.chatId;
        const isVoiceMessage = !!req.file;
        const cleanText = typeof text === "string" ? text.trim() : "";

        if (!isVoiceMessage && !cleanText) {
            return res.status(400).json({ success: false, message: "Message cannot be empty" });
        }

        const chat = await Chat.findById(chatId);
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        const isStudent  = chat.student.toString()  === req.user._id.toString();
        const isCounselor = chat.counselor.toString() === req.user._id.toString();
        if (!isStudent && !isCounselor) {
            removeUploadedFile(req.file);
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        if (chat.status !== "active") {
            removeUploadedFile(req.file);
            return res.status(400).json({ success: false, message: "This chat is closed" });
        }

        const senderRole = req.user.role;
        const recipientId = senderRole === "student" ? chat.counselor : chat.student;
        const message = {
            _id: new mongoose.Types.ObjectId(),
            sender: senderRole,
            senderId: req.user._id,
            text: isVoiceMessage ? "" : cleanText,
            messageType: isVoiceMessage ? "voice" : "text",
            timestamp: new Date(),
            readBy: [req.user._id],
            seenBy: [req.user._id],
            deliveredTo: [req.user._id, recipientId],
            edited: false,
            deletedForAll: false,
            deletedFor: []
        };

        if (isVoiceMessage) {
            message.voice = {
                url: `/uploads/voice/${req.file.filename}`,
                filename: req.file.filename,
                mimeType: req.file.mimetype,
                size: req.file.size,
                duration: Number(req.body.duration || 0)
            };
        }

        if (req.body.replyTo) {
            const parentMsg = chat.messages.id(req.body.replyTo);
            if (parentMsg) {
                message.replyTo = getReplyPreview(parentMsg);
            }
        }

        chat.messages.push(message);
        const lastMessageText = isVoiceMessage ? "Voice message" : cleanText;
        chat.lastMessage = { text: lastMessageText, timestamp: message.timestamp, sender: senderRole };

        if (!chat.unreadCount) chat.unreadCount = { student: 0, counselor: 0 };
        if (senderRole === "student") {
            chat.unreadCount.counselor = (chat.unreadCount.counselor || 0) + 1;
            chat.unreadCount.student = 0;
        } else {
            chat.unreadCount.student = (chat.unreadCount.student || 0) + 1;
            chat.unreadCount.counselor = 0;
        }

        await chat.save();
        const ratingPrompt = await buildRatingPrompt(chat, req.user._id);

const io = req.app.get("io");
if (io) {
    const messagePayload = serializeMessage(message, chatId);

    
    io.to(chatId.toString()).emit("newMessage", messagePayload);
    if (isVoiceMessage) {
        io.to(chatId.toString()).emit("voice_message_sent", messagePayload);
        io.to(chatId.toString()).emit("voice_message_delivered", {
            chatId: chatId.toString(),
            messageId: message._id.toString(),
            deliveredTo: recipientId.toString()
        });
        if (message.replyTo) {
            io.to(chatId.toString()).emit("voice_message_reply_created", messagePayload);
        }
    }

    if (ratingPrompt) {
        io.to(chat.student.toString()).emit("ratingPrompt", {
            ...ratingPrompt,
            chatId: chatId.toString()
        });
    }

    const otherUserId = senderRole === "student"
        ? chat.counselor.toString()
        : chat.student.toString();

    
   
    io.to(otherUserId).emit("conversationUpdated", {
        chatId: chatId,
        lastMessage: lastMessageText,
        timestamp: message.timestamp,
        unreadCount: senderRole === "student"
            ? chat.unreadCount.counselor
            : chat.unreadCount.student
    });
    io.to(otherUserId).emit("refreshConversations");

    const recommendationPayload = buildRecommendations(
        chat.messages
            .filter(msg => msg.messageType !== "voice" && msg.text && !msg.deletedForAll)
            .slice(-12)
            .map(msg => msg.text),
        { limit: 4 }
    );

    io.to(chatId.toString()).emit("recommendations-refresh", {
        source: "chat",
        chatId,
        recommendations: recommendationPayload
    });
    io.to(chat.student.toString()).emit("recommendations-refresh", {
        source: "chat",
        chatId,
        recommendations: recommendationPayload
    });
}
  res.json({
            success: true,
            ratingPrompt,
            message: serializeMessage(message, chatId)
        });

    } catch (err) {
        console.error("Send message error:", err);
        removeUploadedFile(req.file);
        res.status(500).json({ success: false, message: err.message || "Error sending message" });
    }
});

/* MARK AS READ — POST /api/chat/:chatId/read */
router.post("/:chatId/read", isLoggedIn, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

        const requestUserId = req.user._id.toString();
        const studentId = chat.student.toString();
        const counselorId = chat.counselor.toString();
        const isStudent = studentId === requestUserId;
        const isCounselor = counselorId === requestUserId;

        if (!isStudent && !isCounselor) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        if (!chat.unreadCount) {
            chat.unreadCount = { student: 0, counselor: 0 };
        }

        const readerRole = isCounselor ? "counselor" : "student";
        chat.unreadCount[readerRole] = 0;

        let markedMessages = 0;
        const seenMessages = [];
        for (const msg of chat.messages) {
            if (msg.sender === readerRole) continue;
            if (!msg.readBy) msg.readBy = [];
            if (!msg.seenBy) msg.seenBy = [];
            if (!msg.deliveredTo) msg.deliveredTo = [];

            if (!idListIncludes(msg.deliveredTo, requestUserId)) {
                msg.deliveredTo.push(req.user._id);
            }

            const alreadyRead = msg.readBy.some(id => id.toString() === requestUserId);
            if (!alreadyRead) {
                msg.readBy.push(req.user._id);
                if (!idListIncludes(msg.seenBy, requestUserId)) msg.seenBy.push(req.user._id);
                markedMessages += 1;
                seenMessages.push(msg);
            }
        }

        await chat.save();

        const io = req.app.get("io");
        if (io) {
            const payload = {
                chatId: req.params.chatId,
                readerId: requestUserId,
                readerRole,
                unreadCount: 0
            };

            io.to(requestUserId).emit("conversationRead", payload);
            io.to(req.params.chatId).emit("conversationRead", payload);
            io.to(req.params.chatId).emit("messageStatusUpdated", {
                ...payload,
                messageIds: seenMessages.map(msg => msg._id.toString()),
                status: "seen"
            });
            seenMessages
                .filter(msg => getMessageType(msg) === "voice")
                .forEach(msg => {
                    io.to(req.params.chatId).emit("voice_message_seen", {
                        ...payload,
                        messageId: msg._id.toString(),
                        seenBy: requestUserId
                    });
                });
            io.to(requestUserId).emit("refreshConversations");
        }

        res.json({
            success: true,
            message: "Messages marked as read",
            unreadCount: 0,
            markedMessages
        });

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
        if (getMessageType(msg) === "voice") {
            return res.status(400).json({ success: false, message: "Voice messages cannot be edited" });
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

        const requestUserId = req.user._id.toString();
        const isParticipant =
            chat.student.toString() === requestUserId ||
            chat.counselor.toString() === requestUserId;
        if (!isParticipant) return res.status(403).json({ success: false, message: "Unauthorized" });

        const msgIndex = chat.messages.findIndex(m => m._id.toString() === req.params.messageId);
        if (msgIndex === -1) return res.status(404).json({ success: false, message: "Message not found" });

        const msg = chat.messages[msgIndex];
        const messageType = getMessageType(msg);
        if (deleteFor === "all") {
            if (msg.senderId?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, message: "Can only delete your own messages for all" });
            }
            const createdAt = new Date(msg.timestamp || chat.createdAt || Date.now()).getTime();
            if (Date.now() - createdAt > DELETE_FOR_EVERYONE_WINDOW_MS) {
                return res.status(403).json({ success: false, message: "Delete for everyone time window has expired" });
            }
            if (messageType === "voice") {
                removeVoiceFileByMessage(msg);
                msg.voice = {
                    ...(msg.voice?.toObject ? msg.voice.toObject() : msg.voice || {}),
                    url: "",
                    filename: "",
                    deleted: true
                };
            }
            msg.deletedForAll = true;
            msg.deletedAt = new Date();
            msg.text = messageType === "voice" ? "This voice message was deleted" : "This message was deleted";

            chat.messages.forEach(child => {
                if (child.replyTo?.messageId?.toString?.() === msg._id.toString()) {
                    child.replyTo.deletedForAll = true;
                    child.replyTo.text = messageType === "voice" ? "Deleted Voice Message" : "Deleted Message";
                    child.replyTo.duration = messageType === "voice" ? Number(msg.voice?.duration || child.replyTo.duration || 0) : 0;
                }
            });
        } else {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.map(String).includes(requestUserId)) {
                msg.deletedFor.push(req.user._id);
            }
        }

        await chat.save();

        const io = req.app.get("io");
        if (io) {
            if (deleteFor === "all") {
                const payload = {
                    chatId: req.params.chatId,
                    messageId: req.params.messageId,
                    messageType,
                    deletedBy: requestUserId,
                    replacementForSender: messageType === "voice" ? "You deleted this voice message" : "You deleted this message",
                    replacementForReceiver: messageType === "voice" ? "This voice message was deleted" : "This message was deleted",
                    replyReplacement: messageType === "voice" ? "Deleted Voice Message" : "Deleted Message"
                };
                io.to(req.params.chatId).emit("messageDeleted", payload);
                if (messageType === "voice") {
                    io.to(req.params.chatId).emit("voice_message_deleted_for_everyone", payload);
                }
                io.to(req.params.chatId).emit("refreshConversations");
            } else {
                const payload = {
                    chatId: req.params.chatId,
                    messageId: req.params.messageId,
                    messageType,
                    deletedFor: requestUserId
                };
                io.to(requestUserId).emit("messageDeletedForMe", payload);
                if (messageType === "voice") {
                    io.to(requestUserId).emit("voice_message_deleted_for_me", payload);
                }
                io.to(requestUserId).emit("refreshConversations");
            }
        }

        return res.json({ success: true, messageType });
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

router.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    console.error("Chat route error:", err);
    removeUploadedFile(req.file);

    const isUploadError = err instanceof multer.MulterError || /audio|upload|file/i.test(err.message || "");
    res.status(isUploadError ? 400 : 500).json({
        success: false,
        message: err.message || "Error processing chat request"
    });
});

module.exports = router;
