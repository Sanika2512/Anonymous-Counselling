const ModerationAlert = require("../models/ModerationAlert");

const toxicRules = [
  ["Profanity", ["idiot", "stupid", "dumb", "worthless"]],
  ["Hate Speech", ["hate speech", "racist", "casteist", "religion hate"]],
  ["Bullying", ["bully", "harass", "humiliate", "mocking me"]],
  ["Threat", ["kill you", "hurt you", "beat you", "threat"]],
  ["Extreme Harassment", ["blackmail", "stalking", "harassment", "abuse"]],
  ["Spam", ["buy now", "click here", "free money", "promotion"]]
];

const emergencyRules = [
  ["Suicide Risk", ["suicide", "end my life", "kill myself", "want to die", "no reason to live"]],
  ["Self Harm Concern", ["self harm", "cut myself", "hurt myself", "harm myself"]],
  ["Severe Depression", ["hopeless", "can't go on", "cannot go on", "severe depression"]],
  ["Violence Concern", ["hurt someone", "attack someone", "violence"]],
  ["Immediate Emotional Crisis", ["panic attack", "emergency", "immediate help", "crisis"]]
];

function includesAny(text, phrases) {
  return phrases.some(phrase => text.includes(phrase));
}

function analyzeContent(title, description) {
  const text = String(title || "") + " " + String(description || "");
  const normalized = text.toLowerCase();
  const toxicLabels = toxicRules.filter(([, phrases]) => includesAny(normalized, phrases)).map(([label]) => label);
  const emergencyLabels = emergencyRules.filter(([, phrases]) => includesAny(normalized, phrases)).map(([label]) => label);
  const labels = [...new Set([...toxicLabels, ...emergencyLabels])];
  const emergency = emergencyLabels.length > 0;
  const riskLevel = emergency ? "emergency" : toxicLabels.length >= 2 ? "high" : toxicLabels.length === 1 ? "moderate" : "safe";
  const moderationLabel = riskLevel === "safe" ? "Safe" : riskLevel === "moderate" ? "Moderate Risk" : "High Risk";

  return {
    flagged: riskLevel !== "safe",
    emergency,
    labels,
    reasons: labels,
    riskLevel,
    moderationLabel
  };
}

async function createAlertsForPost(post, io) {
  if (!post?.moderation?.flagged) return;
  const type = post.moderation.emergency ? "emergency" : "ai_flag";
  const existing = await ModerationAlert.findOne({ post: post._id, type, status: { $in: ["open", "reviewing"] } });
  if (existing) return;

  const alert = await ModerationAlert.create({
    post: post._id,
    anonymousId: post.anonymousId,
    type,
    riskLevel: post.riskLevel,
    labels: post.moderation.aiLabels || post.moderation.reasons || [],
    reason: post.moderation.emergency ? "Emergency-risk content detected" : "AI moderation flag"
  });

  io?.to("admin-room").emit(type === "emergency" ? "admin:highRiskAlert" : "admin:moderationFlag", {
    id: alert._id,
    postId: post._id,
    anonymousId: post.anonymousId,
    riskLevel: post.riskLevel,
    labels: alert.labels
  });
  io?.emit("counselor:highRiskAlert", {
    anonymousId: post.anonymousId,
    riskLevel: post.riskLevel,
    labels: alert.labels
  });
}

module.exports = {
  analyzeContent,
  createAlertsForPost
};
