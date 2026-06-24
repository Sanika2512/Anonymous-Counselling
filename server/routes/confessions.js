const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ConfessionPost = require("../models/ConfessionPost");
const User = require("../models/User");
const ModerationAlert = require("../models/ModerationAlert");
const { analyzeContent, createAlertsForPost } = require("../services/moderationService");
const { isLoggedIn } = require("../middleware/auth");

const router = express.Router();

const categories = [
  "Placement Stress",
  "Internship Problems",
  "Exam Anxiety",
  "Family Issues",
  "Relationship Issues",
  "Mental Health",
  "Career Guidance",
  "College Life",
  "Motivation",
  "Other"
];

const uploadDir = path.join(__dirname, "../../client/public/uploads/confessions");
const storage = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const safeBase = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-z0-9_-]/gi, "-").slice(0, 40);
    cb(null, `${Date.now()}-${safeBase}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/webm",
  "application/pdf"
]);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter(req, file, cb) {
    if (allowedTypes.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only images, videos, audio files, and PDFs are allowed."));
  }
});

function normalizeId(id) {
  return String(id || "");
}

const studentOnlyMessage = "Only students can create anonymous posts.";

function isStudent(user) {
  return user?.role === "student";
}

function requireStudent(req, res, next) {
  if (!isStudent(req.user)) {
    return res.status(403).json({ success: false, message: studentOnlyMessage });
  }
  next();
}

function blockAdminFeedAccess(req, res, next) {
  if (["admin", "super_admin"].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: "Admins can review confessions only from moderation queues." });
  }
  next();
}

function reactionCounts(reactions = {}) {
  return {
    support: reactions.support?.length || 0,
    meToo: reactions.meToo?.length || 0,
    helpful: reactions.helpful?.length || 0,
    stayStrong: reactions.stayStrong?.length || 0
  };
}

async function ensureAnonymousId(user) {
  if (!isStudent(user)) return counselorDisplayId(user);
  if (user.anonymous_id) return user.anonymous_id;

  let anonymousId;
  let exists = true;
  while (exists) {
    anonymousId = `STU-${Math.floor(1000 + Math.random() * 9000)}`;
    exists = await User.exists({ anonymous_id: anonymousId });
  }

  user.anonymous_id = anonymousId;
  await user.save();
  return anonymousId;
}

async function ensurePostAuthorIdentity(post, user) {
  if (!post || !isStudent(user) || normalizeId(post.author) !== normalizeId(user._id)) {
    return null;
  }

  const anonymousId = await ensureAnonymousId(user);
  if (post.anonymousId !== anonymousId) {
    post.anonymousId = anonymousId;
    post.replies.forEach(reply => {
      if (normalizeId(reply.author) === normalizeId(user._id) && reply.role === "student") {
        reply.anonymousId = anonymousId;
      }
    });
  }
  return anonymousId;
}

function counselorDisplayId(user) {
  const raw = normalizeId(user?._id);
  const suffix = raw ? (parseInt(raw.slice(-6), 16) % 99) + 1 : 1;
  return `Counselor-${String(suffix).padStart(2, "0")}`;
}

function inferCategory(text) {
  const value = String(text || "").toLowerCase();
  const checks = [
    ["Placement Stress", ["placement", "interview", "resume", "offer", "company", "job"]],
    ["Internship Problems", ["internship", "stipend", "mentor", "workload"]],
    ["Exam Anxiety", ["exam", "test", "marks", "study", "backlog", "assignment"]],
    ["Family Issues", ["family", "parent", "home", "financial", "pressure"]],
    ["Relationship Issues", ["relationship", "breakup", "partner", "friendship"]],
    ["Mental Health", ["depress", "anxiety", "panic", "stress", "lonely", "suicide", "self harm"]],
    ["Career Guidance", ["career", "future", "higher studies", "gate", "mba"]],
    ["College Life", ["hostel", "college", "class", "attendance", "campus"]],
    ["Motivation", ["motivation", "confidence", "hope", "discipline"]]
  ];
  return checks.find(([, words]) => words.some(word => value.includes(word)))?.[0] || "Other";
}

function analyzeSentiment(text) {
  const value = String(text || "").toLowerCase();
  const distressed = ["suicide", "self harm", "hopeless", "panic", "depressed", "can't handle", "cannot handle", "overwhelmed", "abuse"];
  const positive = ["thank", "better", "hope", "grateful", "proud", "happy", "improving"];
  if (distressed.some(word => value.includes(word))) return "distressed";
  if (positive.some(word => value.includes(word))) return "positive";
  return "neutral";
}

function moderationScan(text) {
  const value = String(text || "").toLowerCase();
  const rules = {
    abuse: ["idiot", "stupid", "worthless"],
    bullying: ["bully", "harass", "threat"],
    hate: ["hate speech", "racist", "casteist"],
    spam: ["buy now", "click here", "free money"]
  };
  return Object.entries(rules)
    .filter(([, words]) => words.some(word => value.includes(word)))
    .map(([reason]) => reason);
}

function recommendationsFor(category, sentiment) {
  const map = {
    "Placement Stress": ["Resume checklist", "Mock interview practice", "Career articles"],
    "Exam Anxiety": ["Pomodoro study plan", "Time-blocking guide", "Box breathing before exams"],
    "Mental Health": ["Stress management worksheet", "Grounding exercise", "Counselor support materials"],
    "Career Guidance": ["Career planning guide", "Internship search resources", "Skill roadmap"],
    "Internship Problems": ["Workplace communication tips", "Mentor check-in template", "Internship rights basics"],
    "Motivation": ["Small wins planner", "Accountability routine", "Confidence reset exercise"]
  };
  const resources = map[category] || ["Student wellness check-in", "Talk to a verified counselor", "Peer support discussion"];
  return sentiment === "distressed" ? ["Reach out to a counselor now", "Use a 5-minute grounding exercise", ...resources] : resources;
}

function mediaType(mimeType) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "attachment";
}

function serializePost(post, viewer) {
  const viewerId = normalizeId(viewer?._id);
  const reactionKeys = ["support", "meToo", "helpful", "stayStrong"];
  const sortedReplies = [...(post.replies || [])].sort((a, b) => {
    if (a.isHelpfulAnswer !== b.isHelpfulAnswer) return a.isHelpfulAnswer ? -1 : 1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  return {
    id: post._id,
    anonymousId: post.anonymousId,
    category: post.category,
    title: post.title,
    description: post.description,
    media: post.media || [],
    status: post.status,
    sentiment: post.sentiment,
    moderation: post.moderation,
    recommendations: post.recommendations || [],
    reactionCounts: reactionCounts(post.reactions),
    myReactions: Object.fromEntries(reactionKeys.map(key => [
      key,
      (post.reactions?.[key] || []).some(id => normalizeId(id) === viewerId)
    ])),
    replyCount: sortedReplies.length,
    saved: post.savedBy?.some(id => normalizeId(id) === viewerId) || false,
    isOwner: normalizeId(post.author) === viewerId,
    createdAt: post.createdAt,
    replies: sortedReplies.map(reply => ({
      id: reply._id,
      anonymousId: reply.anonymousId,
      body: reply.body,
      parentReply: reply.parentReply,
      role: reply.role,
      isOwner: normalizeId(reply.author) === viewerId,
      isHelpfulAnswer: reply.isHelpfulAnswer,
      isCounselorRecommendation: reply.isCounselorRecommendation,
      createdAt: reply.createdAt,
      editedAt: reply.editedAt
    }))
  };
}

async function fetchPostForViewer(postId, viewer) {
  const post = await ConfessionPost.findById(postId);
  if (!post) return null;
  return serializePost(post, viewer);
}

router.get("/", isLoggedIn, blockAdminFeedAccess, async (req, res) => {
  try {
    const { search, category, sort = "latest", status, saved } = req.query;
    const query = {
      status: { $nin: ["hidden", "removed", "locked"] },
      moderationStatus: { $in: ["approved", null] }
    };

    if (category && categories.includes(category)) query.category = category;
    if (status === "resolved") query.status = "resolved";
    if (status === "unresolved") query.status = "open";
    if (saved === "true") query.savedBy = req.user._id;
    if (search) query.$text = { $search: search };

    let sortBy = { createdAt: -1 };
    if (sort === "mostDiscussed") sortBy = { "replies.0": -1, createdAt: -1 };
    if (sort === "mostHelpful") sortBy = { "reactions.helpful": -1, createdAt: -1 };

    const posts = await ConfessionPost.find(query).sort(sortBy).limit(30);
    const stats = await ConfessionPost.aggregate([
      { $match: { status: { $nin: ["hidden", "removed", "locked"] }, moderationStatus: { $in: ["approved", null] } } },
      {
        $group: {
          _id: null,
          posts: { $sum: 1 },
          resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
          replies: { $sum: { $size: "$replies" } }
        }
      }
    ]);

    res.json({
      success: true,
      posts: posts.map(post => serializePost(post, req.user)),
      categories,
      stats: stats[0] || { posts: 0, resolved: 0, replies: 0 }
    });
  } catch (err) {
    console.error("Confession list error:", err);
    res.status(500).json({ success: false, message: "Could not load confession wall." });
  }
});

router.post("/", isLoggedIn, requireStudent, upload.array("media", 5), async (req, res) => {
  try {
    const { title, description } = req.body;
    let { category } = req.body;

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ success: false, message: "Title and description are required." });
    }

    category = categories.includes(category) ? category : inferCategory(`${title} ${description}`);
    const sentiment = analyzeSentiment(`${title} ${description}`);
    const legacyReasons = moderationScan(`${title} ${description}`);
    const aiModeration = analyzeContent(title, description);
    const reasons = [...new Set([...legacyReasons, ...aiModeration.reasons])];
    const anonymousId = await ensureAnonymousId(req.user);

    const post = await ConfessionPost.create({
      author: req.user._id,
      anonymousId,
      title: title.trim(),
      description: description.trim(),
      category,
      sentiment,
      moderation: {
        flagged: reasons.length > 0,
        reasons,
        aiLabels: aiModeration.labels,
        emergency: aiModeration.emergency
      },
      status: reasons.length > 0 ? "flagged" : "open",
      moderationStatus: "pending",
      riskLevel: aiModeration.riskLevel,
      moderationLabel: aiModeration.moderationLabel,
      recommendations: recommendationsFor(category, sentiment),
      media: (req.files || []).map(file => ({
        type: mediaType(file.mimetype),
        url: `/uploads/confessions/${file.filename}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size
      }))
    });

    await createAlertsForPost(post, req.app.get("io"));
    const serialized = serializePost(post, req.user);
    req.app.get("io")?.to("admin-room").emit("admin:postPending", {
      id: post._id,
      anonymousId: post.anonymousId,
      category: post.category,
      riskLevel: post.riskLevel,
      moderationLabel: post.moderationLabel
    });
    res.status(201).json({ success: true, post: serialized, message: "Post submitted for anonymous moderation." });
  } catch (err) {
    console.error("Confession create error:", err);
    res.status(500).json({ success: false, message: err.message || "Could not create post." });
  }
});

router.put("/:postId", isLoggedIn, requireStudent, async (req, res) => {
  try {
    const post = await ConfessionPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });
    if (normalizeId(post.author) !== normalizeId(req.user._id)) return res.status(403).json({ success: false, message: "Only the post owner can edit this post." });
    await ensurePostAuthorIdentity(post, req.user);

    const { title, description, category } = req.body;
    if (title?.trim()) post.title = title.trim();
    if (description?.trim()) post.description = description.trim();
    if (categories.includes(category)) post.category = category;
    post.sentiment = analyzeSentiment(`${post.title} ${post.description}`);
    const reasons = moderationScan(`${post.title} ${post.description}`);
    post.moderation = { ...post.moderation, flagged: reasons.length > 0, reasons };
    post.recommendations = recommendationsFor(post.category, post.sentiment);
    await post.save();

    const serialized = serializePost(post, req.user);
    req.app.get("io")?.to("confession-wall").emit("confession:updated", serialized);
    res.json({ success: true, post: serialized });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not update post." });
  }
});

router.delete("/:postId", isLoggedIn, requireStudent, async (req, res) => {
  try {
    const post = await ConfessionPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });
    if (normalizeId(post.author) !== normalizeId(req.user._id)) return res.status(403).json({ success: false, message: "Only the post owner can delete this post." });
    await post.deleteOne();
    req.app.get("io")?.to("confession-wall").emit("confession:deleted", { id: req.params.postId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not delete post." });
  }
});

router.post("/:postId/replies", isLoggedIn, async (req, res) => {
  try {
    const { body, parentReply, isCounselorRecommendation } = req.body;
    if (!body?.trim()) return res.status(400).json({ success: false, message: "Reply is required." });

    const post = await ConfessionPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });
    if (post.moderationStatus === "locked" || post.status === "locked") {
      return res.status(423).json({ success: false, message: "This discussion has been locked by moderation." });
    }

    if (isStudent(req.user)) {
      await ensurePostAuthorIdentity(post, req.user);
    }

    const anonymousId = isStudent(req.user) ? await ensureAnonymousId(req.user) : counselorDisplayId(req.user);
    post.replies.push({
      author: req.user._id,
      anonymousId,
      body: body.trim(),
      parentReply: parentReply || null,
      role: req.user.role,
      isCounselorRecommendation: req.user.role === "counselor" && !!isCounselorRecommendation
    });
    await post.save();

    const serialized = await fetchPostForViewer(post._id, req.user);
    const io = req.app.get("io");
    io?.to("confession-wall").emit("confession:updated", serialized);
    if (normalizeId(post.author) !== normalizeId(req.user._id)) {
      io?.to(normalizeId(post.author)).emit("wall-notification", {
        type: req.user.role === "counselor" ? "counselor-replied" : "reply",
        postId: post._id,
        message: req.user.role === "counselor" ? "A counselor replied to your post." : "Someone replied to your post."
      });
    }
    res.status(201).json({ success: true, post: serialized });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not add reply." });
  }
});

router.put("/:postId/replies/:replyId", isLoggedIn, async (req, res) => {
  try {
    const post = await ConfessionPost.findById(req.params.postId);
    const reply = post?.replies.id(req.params.replyId);
    if (!post || !reply) return res.status(404).json({ success: false, message: "Reply not found." });
    if (normalizeId(reply.author) !== normalizeId(req.user._id)) return res.status(403).json({ success: false, message: "Only the reply owner can edit this reply." });
    reply.body = req.body.body?.trim() || reply.body;
    reply.editedAt = new Date();
    await post.save();
    const serialized = await fetchPostForViewer(post._id, req.user);
    req.app.get("io")?.to("confession-wall").emit("confession:updated", serialized);
    res.json({ success: true, post: serialized });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not edit reply." });
  }
});

router.delete("/:postId/replies/:replyId", isLoggedIn, async (req, res) => {
  try {
    const post = await ConfessionPost.findById(req.params.postId);
    const reply = post?.replies.id(req.params.replyId);
    if (!post || !reply) return res.status(404).json({ success: false, message: "Reply not found." });
    if (normalizeId(reply.author) !== normalizeId(req.user._id)) return res.status(403).json({ success: false, message: "Only the reply owner can delete this reply." });
    reply.deleteOne();
    await post.save();
    const serialized = await fetchPostForViewer(post._id, req.user);
    req.app.get("io")?.to("confession-wall").emit("confession:updated", serialized);
    res.json({ success: true, post: serialized });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not delete reply." });
  }
});


router.post("/:postId/report", isLoggedIn, async (req, res) => {
  try {
    const reasons = ["Harassment", "Bullying", "Abuse", "Hate Speech", "Threat", "Spam", "Self Harm Concern", "Other"];
    const { reason = "Other", details = "" } = req.body;
    const post = await ConfessionPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });

    const duplicate = (post.reports || []).some(report => normalizeId(report.reporter) === normalizeId(req.user._id) && report.status === "open");
    if (duplicate) return res.status(409).json({ success: false, message: "You already reported this content." });

    post.reports.push({
      reporter: req.user._id,
      reporterRole: req.user.role,
      reason: reasons.includes(reason) ? reason : "Other",
      details: String(details).slice(0, 600)
    });
    post.moderation.flagged = true;
    post.moderation.reasons = [...new Set([...(post.moderation.reasons || []), reason])];
    if (reason === "Self Harm Concern") {
      post.riskLevel = "emergency";
      post.moderationLabel = "High Risk";
      post.moderation.emergency = true;
    } else if (post.riskLevel === "safe") {
      post.riskLevel = "moderate";
      post.moderationLabel = "Moderate Risk";
    }
    await post.save();

    await ModerationAlert.create({
      post: post._id,
      anonymousId: post.anonymousId,
      type: reason === "Self Harm Concern" ? "emergency" : "report",
      riskLevel: post.riskLevel,
      labels: [reason],
      reason: "User report submitted"
    });

    req.app.get("io")?.to("admin-room").emit("admin:newReport", {
      postId: post._id,
      anonymousId: post.anonymousId,
      reason,
      riskLevel: post.riskLevel
    });

    res.status(201).json({ success: true, message: "Report sent to the moderation team." });
  } catch (err) {
    console.error("Confession report error:", err);
    res.status(500).json({ success: false, message: "Could not submit report." });
  }
});

router.post("/:postId/reactions/:reaction", isLoggedIn, async (req, res) => {
  try {
    const { reaction } = req.params;
    if (!["support", "meToo", "helpful", "stayStrong"].includes(reaction)) {
      return res.status(400).json({ success: false, message: "Unknown reaction." });
    }
    const post = await ConfessionPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });

    const list = post.reactions[reaction] || [];
    const exists = list.some(id => normalizeId(id) === normalizeId(req.user._id));
    post.reactions[reaction] = exists ? list.filter(id => normalizeId(id) !== normalizeId(req.user._id)) : [...list, req.user._id];
    await post.save();

    const serialized = await fetchPostForViewer(post._id, req.user);
    req.app.get("io")?.to("confession-wall").emit("confession:updated", serialized);
    res.json({ success: true, post: serialized });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not update reaction." });
  }
});

router.post("/:postId/save", isLoggedIn, async (req, res) => {
  try {
    const post = await ConfessionPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });
    const exists = post.savedBy.some(id => normalizeId(id) === normalizeId(req.user._id));
    post.savedBy = exists ? post.savedBy.filter(id => normalizeId(id) !== normalizeId(req.user._id)) : [...post.savedBy, req.user._id];
    await post.save();
    const serialized = await fetchPostForViewer(post._id, req.user);
    req.app.get("io")?.to("confession-wall").emit("confession:updated", serialized);
    res.json({ success: true, post: serialized });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not save post." });
  }
});

router.post("/:postId/resolve", isLoggedIn, async (req, res) => {
  try {
    const post = await ConfessionPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });
    if (normalizeId(post.author) !== normalizeId(req.user._id)) return res.status(403).json({ success: false, message: "Only the post owner can mark resolved." });
    post.status = post.status === "resolved" ? "open" : "resolved";
    await post.save();
    const serialized = await fetchPostForViewer(post._id, req.user);
    req.app.get("io")?.to("confession-wall").emit("confession:updated", serialized);
    res.json({ success: true, post: serialized });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not change status." });
  }
});

router.post("/:postId/helpful/:replyId", isLoggedIn, async (req, res) => {
  try {
    const post = await ConfessionPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });
    if (normalizeId(post.author) !== normalizeId(req.user._id)) return res.status(403).json({ success: false, message: "Only the post owner can select the helpful answer." });
    post.replies.forEach(reply => {
      reply.isHelpfulAnswer = normalizeId(reply._id) === normalizeId(req.params.replyId);
    });
    await post.save();
    const serialized = await fetchPostForViewer(post._id, req.user);
    req.app.get("io")?.to("confession-wall").emit("confession:updated", serialized);
    res.json({ success: true, post: serialized });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not mark helpful answer." });
  }
});

module.exports = router;

