const users = [
  {
    username: "student1",
    role: "student",
    email: "student1@gmail.com",
    age: 20,
    problem: "Exam stress"
  },
  {
    username: "student2",
    role: "student",
    email: "student2@gmail.com",
    age: 22,
    problem: "Anxiety"
  },
  {
    username: "counsellor1",
    role: "counsellor",
    email: "counsellor1@gmail.com",
    specialization: "Mental Health"
  }
];

const messages = [
  {
    message: "Hello sir, I feel stressed about exams.",
    time: "2026-02-20 10:30 AM"
  },
  {
    message: "Don’t worry, take deep breaths and plan your study schedule.",
    time: "2026-02-20 10:35 AM"
  }
];

module.exports = { users, messages };