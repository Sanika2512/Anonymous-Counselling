const express = require("express");
const router = express.Router();
const issueController = require("../controllers/issueController");
const auth = require("../middleware/auth");

// Create new issue (ONLY student)
router.post("/create", auth.isStudent, issueController.createIssue);

// Get issues of logged-in student
router.get("/my", auth.isStudent, issueController.getMyIssues);

// Assign counselor to issue (ONLY counselor)
router.post("/assign", auth.isCounselor, issueController.assignCounselor);

module.exports = router;