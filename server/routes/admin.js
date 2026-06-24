const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Chat = require("../models/Chat");
const Issue = require("../models/Issue");
const ConfessionPost = require("../models/ConfessionPost");
const AuditLog = require("../models/AuditLog");
const ModerationAlert = require("../models/ModerationAlert");

function isAdmin(req, res, next) {
  if (req.isAuthenticated() && ["admin", "super_admin"].includes(req.user.role)) return next();
  return res.status(403).json({ success: false, message: "Admin access only" });
}

function page(req) {
  return Math.max(parseInt(req.query.page, 10) || 1, 1);
}

function limit(req) {
  return Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function privacySafeUser(user, counts = {}) {
  return {
    id: user._id,
    _id: user._id,
    anonymousId: user.anonymous_id || "Anonymous",
    role: user.role,
    joinedAt: user.createdAt,
    createdAt: user.createdAt,
    accountStatus: user.accountStatus || "active",
    isOnline: !!user.isOnline,
    postsCount: counts.postsCount || 0,
    sessionCount: counts.postsCount || 0,
    repliesCount: counts.repliesCount || 0,
    reportsReceived: counts.reportsReceived || 0,
    warningsCount: user.warnings?.length || 0
  };
}

function postPreview(post) {
  return {
    id: post._id,
    anonymousId: post.anonymousId,
    title: post.title,
    content: post.description,
    category: post.category,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    status: post.status,
    moderationStatus: post.moderationStatus || "pending",
    reportsCount: post.reports?.length || 0,
    openReportsCount: (post.reports || []).filter(report => report.status === "open").length,
    riskLevel: post.riskLevel || "safe",
    moderationLabel: post.moderationLabel || "Safe",
    moderationReasons: post.moderation?.reasons || [],
    aiLabels: post.moderation?.aiLabels || [],
    emergency: !!post.moderation?.emergency,
    replyCount: post.replies?.length || 0
  };
}

async function audit(req, action, targetType, target, note) {
  await AuditLog.create({
    admin: req.user._id,
    action,
    targetType,
    targetId: target?._id,
    targetSnapshot: target ? {
      anonymousId: target.anonymousId || target.anonymous_id,
      category: target.category,
      moderationStatus: target.moderationStatus,
      riskLevel: target.riskLevel
    } : undefined,
    note
  });
}

function filtersFromQuery(query) {
  const filter = {};
  if (query.search) filter.$text = { $search: query.search };
  if (query.category) filter.category = query.category;
  if (query.status) filter.moderationStatus = query.status;
  if (query.riskLevel) filter.riskLevel = query.riskLevel;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = startOfDay(query.from);
    if (query.to) {
      const end = startOfDay(query.to);
      end.setDate(end.getDate() + 1);
      filter.createdAt.$lt = end;
    }
  }
  if (query.minReports) {
    filter.$expr = { $gte: [{ $size: { $ifNull: ["$reports", []] } }, Number(query.minReports)] };
  }
  return filter;
}

router.get("/stats", isAdmin, async (req, res) => {
  try {
    const today = startOfDay(new Date());
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(today);
    monthStart.setDate(monthStart.getDate() - 29);

    const [
      totalUsers,
      totalConfessions,
      totalDiscussions,
      totalReportsAgg,
      pendingModeration,
      emergencyRiskPosts,
      activeCounselors,
      dailyActiveUsers,
      weeklyActiveUsers,
      monthlyActiveUsers,
      topCategories,
      weeklyPosts
    ] = await Promise.all([
      User.countDocuments({ role: { $in: ["student", "counselor"] } }),
      ConfessionPost.countDocuments(),
      ConfessionPost.countDocuments({ "replies.0": { $exists: true } }),
      ConfessionPost.aggregate([{ $project: { count: { $size: { $ifNull: ["$reports", []] } } } }, { $group: { _id: null, total: { $sum: "$count" } } }]),
      ConfessionPost.countDocuments({ moderationStatus: "pending" }),
      ConfessionPost.countDocuments({ riskLevel: { $in: ["high", "emergency"] } }),
      User.countDocuments({ role: "counselor", isOnline: true }),
      User.countDocuments({ lastSeen: { $gte: today } }),
      User.countDocuments({ lastSeen: { $gte: weekStart } }),
      User.countDocuments({ lastSeen: { $gte: monthStart } }),
      ConfessionPost.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 6 }]),
      ConfessionPost.aggregate([
        { $match: { createdAt: { $gte: weekStart } } },
        { $group: { _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      success: true,
      metrics: {
        totalUsers,
        totalConfessions,
        totalDiscussions,
        totalReports: totalReportsAgg[0]?.total || 0,
        pendingModeration,
        emergencyRiskPosts,
        activeCounselors,
        dailyActiveUsers,
        weeklyActiveUsers,
        monthlyActiveUsers
      },
      topCategories,
      weeklyPosts
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/moderation/posts", isAdmin, async (req, res) => {
  try {
    const currentPage = page(req);
    const pageSize = limit(req);
    const filter = filtersFromQuery(req.query);
    const [total, posts] = await Promise.all([
      ConfessionPost.countDocuments(filter),
      ConfessionPost.find(filter).sort({ riskLevel: -1, createdAt: -1 }).skip((currentPage - 1) * pageSize).limit(pageSize).lean()
    ]);
    res.json({ success: true, posts: posts.map(postPreview), page: currentPage, limit: pageSize, total });
  } catch (err) {
    console.error("Admin moderation list error:", err);
    res.status(500).json({ success: false, message: "Could not load moderation queue" });
  }
});

router.patch("/moderation/posts/:id/:action", isAdmin, async (req, res) => {
  try {
    const actionMap = {
      approve: { moderationStatus: "approved", status: "open" },
      reject: { moderationStatus: "rejected", status: "hidden" },
      remove: { moderationStatus: "removed", status: "removed" },
      restore: { moderationStatus: "approved", status: "open" },
      lock: { moderationStatus: "locked", status: "locked" },
      hide: { moderationStatus: "hidden", status: "hidden" }
    };
    const update = actionMap[req.params.action];
    if (!update) return res.status(400).json({ success: false, message: "Unknown moderation action" });

    const post = await ConfessionPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    post.set({
      ...update,
      "moderation.reviewed": true,
      "moderation.reviewedBy": req.user._id,
      "moderation.reviewedAt": new Date()
    });
    await post.save();

    await audit(req, "post_" + req.params.action, "post", post, req.body.note);
    await ModerationAlert.updateMany({ post: post._id, status: { $in: ["open", "reviewing"] } }, {
      status: req.params.action === "approve" ? "dismissed" : "resolved",
      resolvedBy: req.user._id,
      resolvedAt: new Date()
    });

    req.app.get("io")?.to("admin-room").emit("admin:moderationUpdated", postPreview(post));
    req.app.get("io")?.to("admin-room").emit("admin:queuesChanged", {
      source: "moderation",
      action: req.params.action,
      post: postPreview(post)
    });
    req.app.get("io")?.to("confession-wall").emit("confession:deleted", { id: post._id });
    res.json({ success: true, post: postPreview(post) });
  } catch (err) {
    console.error("Admin moderation action error:", err);
    res.status(500).json({ success: false, message: "Could not update post" });
  }
});

router.get("/reports", isAdmin, async (req, res) => {
  try {
    const posts = await ConfessionPost.find({ "reports.0": { $exists: true } }).sort({ "reports.createdAt": -1 }).limit(100).lean();
    const reports = posts.flatMap(post => (post.reports || []).map(report => ({
      id: report._id,
      postId: post._id,
      anonymousId: post.anonymousId,
      reason: report.reason,
      status: report.status,
      contentPreview: (String(post.title || "") + " - " + String(post.description || "")).slice(0, 180),
      category: post.category,
      reportCount: post.reports.length,
      riskLevel: post.riskLevel,
      createdAt: report.createdAt
    }))).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, reports });
  } catch (err) {
    console.error("Admin reports error:", err);
    res.status(500).json({ success: false, message: "Could not load reports" });
  }
});

router.patch("/reports/:postId/:reportId/:action", isAdmin, async (req, res) => {
  try {
    const post = await ConfessionPost.findById(req.params.postId);
    const report = post?.reports.id(req.params.reportId);
    if (!post || !report) return res.status(404).json({ success: false, message: "Report not found" });

    if (req.params.action === "dismiss") {
      report.status = "dismissed";
    } else if (req.params.action === "remove") {
      report.status = "actioned";
      post.moderationStatus = "removed";
      post.status = "removed";
    } else {
      return res.status(400).json({ success: false, message: "Unknown report action" });
    }

    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();
    await post.save();
    await audit(req, "report_" + req.params.action, "report", post, req.body.note);
    req.app.get("io")?.to("admin-room").emit("admin:reportUpdated", {
      postId: post._id,
      reportId: report._id,
      action: req.params.action,
      anonymousId: post.anonymousId
    });
    req.app.get("io")?.to("admin-room").emit("admin:queuesChanged", {
      source: "reports",
      action: req.params.action
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Admin report action error:", err);
    res.status(500).json({ success: false, message: "Could not update report" });
  }
});

router.get("/alerts", isAdmin, async (req, res) => {
  try {
    const alerts = await ModerationAlert.find(req.query.status ? { status: req.query.status } : {})
      .sort({ riskLevel: -1, createdAt: -1 })
      .limit(100)
      .populate("post", "title description category riskLevel moderationStatus createdAt")
      .lean();
    res.json({ success: true, alerts: alerts.map(alert => ({
      id: alert._id,
      postId: alert.post?._id,
      anonymousId: alert.anonymousId,
      type: alert.type,
      riskLevel: alert.riskLevel,
      labels: alert.labels || [],
      reason: alert.reason,
      status: alert.status,
      category: alert.post?.category,
      contentPreview: (String(alert.post?.title || "") + " - " + String(alert.post?.description || "")).slice(0, 180),
      createdAt: alert.createdAt
    })) });
  } catch (err) {
    console.error("Admin alerts error:", err);
    res.status(500).json({ success: false, message: "Could not load alerts" });
  }
});

router.get("/users", isAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.status) filter.accountStatus = req.query.status;

    const users = await User.find(filter).select("_id role anonymous_id createdAt accountStatus warnings isOnline").sort({ createdAt: -1 }).limit(100).lean();
    const rows = await Promise.all(users.map(async user => {
      const [postsCount, reportsAgg] = await Promise.all([
        ConfessionPost.countDocuments({ author: user._id }),
        ConfessionPost.aggregate([
          { $match: { author: user._id } },
          { $project: { count: { $size: { $ifNull: ["$reports", []] } } } },
          { $group: { _id: null, total: { $sum: "$count" } } }
        ])
      ]);
      return privacySafeUser(user, { postsCount, reportsReceived: reportsAgg[0]?.total || 0 });
    }));

    res.json({ success: true, users: rows });
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/users/:id/:action", isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (["admin", "super_admin"].includes(user.role)) return res.status(403).json({ success: false, message: "Admin accounts cannot be moderated here" });

    if (req.params.action === "warn") {
      user.accountStatus = "warned";
      user.warnings.push({ reason: req.body.reason || "Content policy warning", issuedBy: req.user._id });
    } else if (req.params.action === "suspend") {
      user.accountStatus = "suspended";
      const until = new Date();
      until.setDate(until.getDate() + (Number(req.body.days) || 7));
      user.suspendedUntil = until;
    } else if (req.params.action === "ban") {
      user.accountStatus = "permanently_suspended";
      user.suspendedUntil = null;
    } else if (req.params.action === "unsuspend") {
      user.accountStatus = "active";
      user.suspendedUntil = null;
    } else {
      return res.status(400).json({ success: false, message: "Unknown user action" });
    }

    await user.save();
    await audit(req, "user_" + req.params.action, "user", { _id: user._id, anonymous_id: user.anonymous_id }, req.body.reason);
    const safeUser = privacySafeUser(user);
    req.app.get("io")?.to("admin-room").emit("admin:userUpdated", {
      user: safeUser,
      action: req.params.action
    });
    res.json({ success: true, user: safeUser, message: `User ${req.params.action} completed` });
  } catch (err) {
    console.error("Admin user action error:", err);
    res.status(500).json({ success: false, message: "Could not update user" });
  }
});

router.get("/analytics", isAdmin, async (req, res) => {
  try {
    const monthStart = startOfDay(new Date());
    monthStart.setDate(monthStart.getDate() - 29);
    const [growth, reportedCategories, counselorStats] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: monthStart } } },
        { $group: { _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      ConfessionPost.aggregate([
        { $unwind: { path: "$reports", preserveNullAndEmptyArrays: false } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ]),
      Chat.aggregate([
        { $group: { _id: "$counselor", sessions: { $sum: 1 }, messages: { $sum: { $size: "$messages" } } } },
        { $sort: { sessions: -1 } },
        { $limit: 8 }
      ])
    ]);

    res.json({ success: true, growth, reportedCategories, counselorStats });
  } catch (err) {
    console.error("Admin analytics error:", err);
    res.status(500).json({ success: false, message: "Could not load analytics" });
  }
});

router.get("/audit-logs", isAdmin, async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, logs });
  } catch (err) {
    console.error("Admin audit error:", err);
    res.status(500).json({ success: false, message: "Could not load audit logs" });
  }
});

module.exports = router;
