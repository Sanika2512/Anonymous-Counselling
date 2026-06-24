const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const recommendationController = require("../controllers/recommendationController");

router.get("/dashboard", auth.isStudent, recommendationController.getDashboardRecommendations);
router.get("/chat/:chatId", auth.isLoggedIn, recommendationController.getChatRecommendations);

module.exports = router;
