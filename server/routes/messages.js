const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const auth = require("../middleware/auth");

router.get("/:issueId", auth.isLoggedIn, messageController.getMessages);
router.post("/send", auth.isLoggedIn, messageController.sendMessage);
router.get("/counselor-status/:issueId", auth.isLoggedIn, messageController.getCounselorStatus);

module.exports = router;