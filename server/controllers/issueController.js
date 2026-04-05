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