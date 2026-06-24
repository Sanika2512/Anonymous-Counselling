const Issue = require("../models/Issue");
const User = require("../models/User");

// ================= CREATE ISSUE =================
exports.createIssue = async (req, res) => {
  try {
    const { title, category, description } = req.body;

    const issue = new Issue({
      studentId: req.user._id,   // logged-in student
      title,
      category,
      description
    });

    await issue.save();
    const io = req.app.get("io");
    if (io) {
      io.to(req.user._id.toString()).emit("recommendations-refresh", {
        source: "issue",
        issueId: issue._id
      });
      io.emit("issue-created", issue);
      io.emit("counselor-list-update");
    }
    res.json({ success: true, issue });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error creating issue" });
  }
};

// ================= GET MY ISSUES (STUDENT) =================
exports.getMyIssues = async (req, res) => {
  try {
    const issues = await Issue.find({ studentId: req.user._id });
    res.json(issues);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error fetching issues" });
  }
};

// ================= ASSIGN COUNSELOR =================
exports.assignCounselor = async (req, res) => {
  try {
    const { issueId, counselorId } = req.body;

    await Issue.findByIdAndUpdate(issueId, {
      counselorId: counselorId,
      status: "in-progress"
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error assigning counselor" });
  }
};

// ================= COUNSELOR DASHBOARD STATS =================
exports.getStats = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const counselorId = req.user._id;

    const [activeChats, pendingIssues, resolvedToday, emergencyAlerts] = await Promise.all([
      Issue.countDocuments({
        counselorId,
        status: { $in: ["open", "in-progress"] }
      }),
      Issue.countDocuments({
        status: "open",
        $or: [
          { counselorId: { $exists: false } },
          { counselorId: null }
        ]
      }),
      Issue.countDocuments({
        counselorId,
        status: { $in: ["resolved", "closed"] },
        updatedAt: { $gte: startOfToday }
      }),
      Issue.countDocuments({
        status: { $ne: "resolved" },
        $or: [
          { category: /emergency|urgent|crisis/i },
          { title: /emergency|urgent|crisis/i },
          { description: /emergency|urgent|crisis/i }
        ]
      })
    ]);

    res.json({
      success: true,
      stats: {
        activeChats,
        pendingIssues,
        resolvedToday,
        emergencyAlerts
      }
    });
  } catch (err) {
    console.error("Error fetching issue stats:", err);
    res.status(500).json({ success: false, message: "Error fetching issue stats" });
  }
};

// ================= UPDATE ISSUE =================
exports.updateIssue = async (req, res) => {
  try {
    const allowedFields = ["title", "category", "description", "status", "counselorId"];
    const update = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    const issue = await Issue.findByIdAndUpdate(
      req.params.issueId,
      update,
      { new: true }
    );

    if (!issue) {
      return res.status(404).json({ success: false, message: "Issue not found" });
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("issue-updated", issue);
      io.emit("counselor-list-update");
      if (issue.studentId) {
        io.to(issue.studentId.toString()).emit("recommendations-refresh", {
          source: "issue",
          issueId: issue._id
        });
      }
    }

    res.json({ success: true, issue });
  } catch (err) {
    console.error("Error updating issue:", err);
    res.status(500).json({ success: false, message: "Error updating issue" });
  }
};
