require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const flash = require("connect-flash");
const http = require("http");
const { Server } = require("socket.io");
const setupSocket = require("../socket/socketHandler");

const User = require("../models/User");
const Chat = require("../models/Chat");

const counselorRoutes = require('../routes/counselors');
const userRoutes = require("../routes/users");
const chatRoutes = require("../routes/chat");
const { isStudent, isCounselor, isLoggedIn } = require("../middleware/auth");
const anonymousId = require("../middleware/anonymousId");

// ================= DB CONNECTION =================
mongoose.connect(process.env.ATLASDB_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "../../client/public/uploads")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../../client/views"));
app.use(express.static(path.join(__dirname, "../../client/public")));

app.use(session({
    secret: process.env.SESSION_SECRET || "anonymous-counselling-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, 
        httpOnly: true,
        secure: false
    }
}));

app.use(anonymousId);
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({ usernameField: "email" }, User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currentUser = req.user;
  res.locals.currentUrl = req.originalUrl;
  next();
});

// ================= ROUTES =================
app.use("/api/ratings", require("../routes/ratings"));
app.use("/api/auth", userRoutes);
app.use("/api/issues", require("../routes/issues"));
app.use("/api/messages", require("../routes/messages"));
app.use("/api/counselors", counselorRoutes);
app.use("/api/chat", chatRoutes);

// ================= PAGE ROUTES =================
app.get("/", (req, res) => {
  res.render("index", { title: "Home", user: req.user || null });
});

app.get("/login", (req, res) => {
  res.render("login", { title: "Login" });
});

app.get("/signup", (req, res) => {
  res.render("signup", { title: "Signup" });
});
// Add this page route in index.js — alongside your other page routes
app.get("/chatbot", (req, res) => {
  res.render("chatbot", { chatId: null });
});

app.get("/student-dashboard", isStudent, (req, res) => {
  res.render("student-dashboard", {
    title: "Student Dashboard",
    user: req.user
  });
});

app.get("/counselor-dashboard", isCounselor, (req, res) => {
  res.render("counselor-dashboard", {
    title: "Counselor Dashboard",
    user: req.user
  });
});

app.get("/chat/:chatId", isLoggedIn, (req, res) => {
  res.render("chat", {
    title: "Chat",
    chatId: req.params.chatId,
    user: req.user
  });
});

app.get("/api/chats", isLoggedIn, (req, res) => {
    res.redirect("/api/chat");
});

// ================= SERVER + SOCKET =================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  }
});

app.set("io", io);
setupSocket(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ Server started on port ${PORT}`);
});

// ✅ Prevent crash on port conflict
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} already in use!`);
    console.error(`   Run this to fix: taskkill /F /IM node.exe`);
    console.error(`   Then restart: node init/index.js`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
  }
});