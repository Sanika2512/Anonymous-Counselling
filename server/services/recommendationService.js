const CATEGORY_DEFINITIONS = [
  {
    key: "stress",
    label: "Stress",
    icon: "fa-spa",
    keywords: ["stress", "stressed", "overwhelmed", "pressure", "burnout", "tension", "worry", "worried"]
  },
  {
    key: "anxiety",
    label: "Anxiety",
    icon: "fa-wind",
    keywords: ["anxiety", "anxious", "panic", "fear", "nervous", "restless", "racing thoughts"]
  },
  {
    key: "depression",
    label: "Low Mood",
    icon: "fa-heart-pulse",
    keywords: ["depressed", "depression", "sad", "hopeless", "empty", "worthless", "crying", "tired of life"]
  },
  {
    key: "academic",
    label: "Academic Pressure",
    icon: "fa-book-open",
    keywords: ["academic", "assignment", "homework", "grade", "grades", "study", "class", "college", "school"]
  },
  {
    key: "exam",
    label: "Exam Stress",
    icon: "fa-clipboard-check",
    keywords: ["exam", "test", "revision", "syllabus", "marks", "fail", "deadline", "presentation"]
  },
  {
    key: "career",
    label: "Career Confusion",
    icon: "fa-briefcase",
    keywords: ["career", "future", "job", "internship", "placement", "resume", "interview", "profession"]
  },
  {
    key: "relationship",
    label: "Relationship Issues",
    icon: "fa-people-arrows",
    keywords: ["relationship", "breakup", "friend", "friends", "partner", "family", "parent", "argument", "fight"]
  },
  {
    key: "loneliness",
    label: "Loneliness",
    icon: "fa-user-group",
    keywords: ["lonely", "alone", "isolated", "ignored", "no friends", "left out", "homesick"]
  },
  {
    key: "motivation",
    label: "Low Motivation",
    icon: "fa-bolt",
    keywords: ["motivation", "unmotivated", "lazy", "procrastinate", "stuck", "no energy", "can't start"]
  },
  {
    key: "time",
    label: "Time Management",
    icon: "fa-calendar-check",
    keywords: ["time management", "late", "schedule", "routine", "manage time", "distracted", "focus"]
  },
  {
    key: "confidence",
    label: "Self Confidence",
    icon: "fa-seedling",
    keywords: ["confidence", "self esteem", "self-confidence", "inferior", "not good enough", "failure"]
  },
  {
    key: "sleep",
    label: "Sleep & Recovery",
    icon: "fa-moon",
    keywords: ["sleep", "insomnia", "can't sleep", "nightmare", "tired", "exhausted"]
  }
];

const RESOURCE_LIBRARY = {
  stress: [
    resource("article", "5-minute stress reset", "A quick guide for calming your body before stress turns into shutdown.", "Try a guided body scan, unclench your jaw, and name one next step.", "https://www.mind.org.uk/information-support/types-of-mental-health-problems/stress/"),
    resource("meditation", "Box breathing practice", "A simple breathing pattern to steady racing thoughts during pressure.", "Inhale 4, hold 4, exhale 4, hold 4 for three rounds.", "https://www.youtube.com/results?search_query=box+breathing+exercise"),
    resource("tip", "Make the next task tiny", "Choose one task that can be finished in 10 minutes to regain momentum.", "Write the task as a verb: open notes, solve one question, email counselor.")
  ],
  anxiety: [
    resource("meditation", "Grounding for anxiety", "Use the 5-4-3-2-1 method to reconnect with the present moment.", "Notice 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste.", "https://www.youtube.com/results?search_query=5+4+3+2+1+grounding+exercise"),
    resource("article", "Understanding anxious thoughts", "Learn how anxiety can exaggerate risk and how to respond gently.", "Treat anxious thoughts as signals, not facts.", "https://www.nhs.uk/mental-health/conditions/generalised-anxiety-disorder/overview/"),
    resource("tip", "Slow network, slow breath", "When your body feels rushed, extend your exhale first.", "Try inhaling for 3 seconds and exhaling for 6 seconds.")
  ],
  depression: [
    resource("article", "When everything feels heavy", "Small supportive actions for low mood without self-judgment.", "Pick one caring action: water, shower, sunlight, or message someone safe.", "https://www.nimh.nih.gov/health/topics/depression"),
    resource("tip", "Two-minute activation", "Motivation often follows movement, not the other way around.", "Set a 2-minute timer and do the smallest useful action."),
    resource("video", "Gentle self-compassion", "A short self-compassion practice for difficult days.", "Use kind language you would use for a friend.", "https://www.youtube.com/results?search_query=self+compassion+meditation+students")
  ],
  academic: [
    resource("article", "Study plan that survives real life", "Build a realistic plan around energy, deadlines, and recovery.", "Plan three priority blocks, not a perfect day.", "https://learningcenter.unc.edu/tips-and-tools/studying-101-study-smarter-not-harder/"),
    resource("tip", "Pomodoro with proof", "Use 25 minutes of focus and write down what changed at the end.", "Your proof can be one solved problem or one summarized page."),
    resource("video", "Study focus session", "A structured focus session for getting started when tasks feel large.", "Keep phone away and start with the easiest visible step.", "https://www.youtube.com/results?search_query=study+with+me+pomodoro")
  ],
  exam: [
    resource("article", "Exam anxiety toolkit", "Practical ways to prepare your mind and schedule before tests.", "Separate revision, practice, and rest into different blocks.", "https://www.nhs.uk/mental-health/children-and-young-adults/advice-for-parents/tips-on-preparing-for-exams/"),
    resource("tip", "Active recall sprint", "Close notes and answer one question from memory before rereading.", "This shows what you know and where to revise next."),
    resource("video", "Breathing before exams", "A calm breathing exercise designed for pre-exam nerves.", "Do it before opening notes, not only when panic peaks.", "https://www.youtube.com/results?search_query=breathing+exercise+before+exam")
  ],
  career: [
    resource("article", "Career clarity worksheet", "Turn uncertainty into experiments instead of one permanent decision.", "List three roles, one skill gap, and one person to ask for advice.", "https://www.careeronestop.org/ExploreCareers/explore-careers.aspx"),
    resource("tip", "One-week career experiment", "Choose one small career action this week.", "Watch a role video, update one resume section, or message one senior."),
    resource("video", "Interview confidence basics", "Practical interview preparation for students and early-career applicants.", "Prepare stories using situation, action, result.", "https://www.youtube.com/results?search_query=interview+preparation+for+students")
  ],
  relationship: [
    resource("article", "Healthy boundaries", "Learn how boundaries protect respect and emotional safety.", "Use clear sentences: I can talk after class, but not during study time.", "https://www.loveisrespect.org/resources/what-are-my-boundaries/"),
    resource("tip", "Name the need", "Before replying during conflict, name what you need: space, clarity, respect, or support.", "This reduces reactive messages."),
    resource("meditation", "Compassion after conflict", "A short practice for settling after a hard conversation.", "Breathe first, decide later.", "https://www.youtube.com/results?search_query=meditation+after+conflict")
  ],
  loneliness: [
    resource("article", "Feeling lonely at college", "Ideas for rebuilding connection without forcing instant closeness.", "Aim for repeated low-pressure contact, not one perfect friendship.", "https://jedfoundation.org/resource/how-to-deal-with-loneliness-in-college/"),
    resource("tip", "One low-risk message", "Send one simple message to someone safe.", "Try: Want to study together for 30 minutes this week?"),
    resource("video", "Guided meditation for loneliness", "A warm practice for feeling connected while you rebuild support.", "Use it as support, not as a substitute for people.", "https://www.youtube.com/results?search_query=guided+meditation+for+loneliness")
  ],
  motivation: [
    resource("article", "Beat procrastination gently", "A practical approach to starting tasks when motivation is low.", "Shrink the start until it feels almost too easy.", "https://todoist.com/productivity-methods/eat-the-frog"),
    resource("tip", "Start ugly", "Give yourself permission to make a rough first version.", "A rough start beats a perfect plan that never begins."),
    resource("video", "Motivation reset for students", "A short video to restart momentum without shame.", "Pair it with one immediate 10-minute action.", "https://www.youtube.com/results?search_query=student+motivation+reset")
  ],
  time: [
    resource("article", "Time blocking basics", "Use blocks to protect focus, rest, and deadlines.", "Schedule recovery too, or the plan will break.", "https://todoist.com/productivity-methods/time-blocking"),
    resource("tip", "Three-block day", "Pick one study block, one life-admin block, and one rest block.", "Keep each block realistic and visible."),
    resource("video", "Focus planning for students", "A practical planning method for busy student schedules.", "Plan tasks by energy level, not only urgency.", "https://www.youtube.com/results?search_query=time+management+for+students")
  ],
  confidence: [
    resource("article", "Build self-confidence", "Confidence grows through evidence, repetition, and self-respect.", "Write one thing you handled this week, even if it was small.", "https://www.mind.org.uk/for-young-people/feelings-and-experiences/confidence-and-self-esteem/"),
    resource("tip", "Evidence list", "Keep a note of small wins and kind feedback.", "Read it when your mind says you never do enough."),
    resource("meditation", "Self-worth meditation", "A short practice for reducing harsh self-talk.", "Notice the thought, then answer it with balance.", "https://www.youtube.com/results?search_query=self+esteem+guided+meditation")
  ],
  sleep: [
    resource("article", "Sleep hygiene for students", "Small sleep changes that support mood, memory, and energy.", "Keep one wake-up time and dim screens before bed.", "https://www.sleepfoundation.org/sleep-hygiene"),
    resource("meditation", "Sleep wind-down", "A gentle audio-style routine for settling before sleep.", "Use it away from bright screens when possible.", "https://www.youtube.com/results?search_query=guided+sleep+meditation"),
    resource("tip", "Worry parking", "Write worries and one next action before bed.", "Tell your brain the list is saved for tomorrow.")
  ],
  general: [
    resource("article", "Student wellness check-in", "A broad mental wellness guide for moments when the issue is still unclear.", "Start by rating sleep, stress, connection, and workload from 1 to 5.", "https://www.activeminds.org/about-mental-health/self-care/"),
    resource("tip", "Support triangle", "Use three supports: one person, one healthy routine, and one professional channel.", "Your counselor chat can be the professional support channel."),
    resource("meditation", "One-minute breathing space", "A quick mindfulness reset that works between classes.", "Pause, breathe, notice, then choose the next action.", "https://www.youtube.com/results?search_query=one+minute+breathing+space")
  ]
};

function resource(type, title, description, action, url = "") {
  return { type, title, description, action, url };
}

function normalize(text) {
  return String(text || "").toLowerCase();
}

function analyzeText(inputParts = []) {
  const text = normalize(inputParts.filter(Boolean).join(" "));
  const scores = CATEGORY_DEFINITIONS.map(category => {
    const score = category.keywords.reduce((total, keyword) => {
      const needle = normalize(keyword);
      return total + (text.includes(needle) ? Math.max(1, needle.split(" ").length) : 0);
    }, 0);
    return { ...category, score };
  }).filter(category => category.score > 0);

  scores.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scores.length ? scores.slice(0, 3) : [CATEGORY_DEFINITIONS.find(c => c.key === "stress")];
}

function buildRecommendations(inputParts = [], options = {}) {
  const detectedCategories = analyzeText(inputParts);
  const categoryKeys = detectedCategories.map(category => category.key);
  const picked = [];
  const seen = new Set();

  for (const key of [...categoryKeys, "general"]) {
    const libraryItems = RESOURCE_LIBRARY[key] || [];
    for (const item of libraryItems) {
      const dedupeKey = `${item.type}:${item.title}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      picked.push({
        ...item,
        category: (CATEGORY_DEFINITIONS.find(c => c.key === key)?.label) || "General Wellness",
        categoryKey: key,
        icon: (CATEGORY_DEFINITIONS.find(c => c.key === key)?.icon) || "fa-leaf"
      });
      if (picked.length >= (options.limit || 6)) break;
    }
    if (picked.length >= (options.limit || 6)) break;
  }

  return {
    generatedAt: new Date(),
    disclaimer: "These resources are informational and do not replace professional mental health support.",
    detectedCategories: detectedCategories.map(({ key, label, score, icon }) => ({ key, label, score, icon })),
    recommendations: picked
  };
}

module.exports = {
  buildRecommendations,
  analyzeText
};
