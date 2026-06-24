const Issue = require("../models/Issue");
const Chat = require("../models/Chat");
const { buildRecommendations } = require("../services/recommendationService");

function recentTextMessages(chat, limit = 12) {
  return (chat?.messages || [])
    .filter(message => message.messageType !== "voice" && message.text && !message.deletedForAll)
    .slice(-limit)
    .map(message => message.text);
}

exports.getDashboardRecommendations = async (req, res) => {
  try {
    const [issues, chats] = await Promise.all([
      Issue.find({ studentId: req.user._id }).sort({ updatedAt: -1 }).limit(5).lean(),
      Chat.find({ student: req.user._id }).sort({ updatedAt: -1 }).limit(3).lean()
    ]);

    const issueText = issues.flatMap(issue => [issue.title, issue.category, issue.description]);
    const chatText = chats.flatMap(chat => recentTextMessages(chat, 5));
    const payload = buildRecommendations([...issueText, ...chatText], { limit: 6 });

    res.json({ success: true, ...payload });
  } catch (err) {
    console.error("Dashboard recommendation error:", err);
    res.status(500).json({ success: false, message: "Unable to load recommendations" });
  }
};

exports.getChatRecommendations = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId).lean();
    if (!chat) {
      return res.status(404).json({ success: false, message: "Chat not found" });
    }

    const requestUserId = req.user._id.toString();
    const isStudent = chat.student?.toString() === requestUserId;
    const isCounselor = chat.counselor?.toString() === requestUserId;

    if (!isStudent && !isCounselor) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const payload = buildRecommendations(recentTextMessages(chat), { limit: 4 });
    res.json({ success: true, ...payload });
  } catch (err) {
    console.error("Chat recommendation error:", err);
    res.status(500).json({ success: false, message: "Unable to load chat recommendations" });
  }
};

