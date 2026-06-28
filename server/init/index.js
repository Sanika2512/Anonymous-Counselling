const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });



const express = require("express");

const mongoose = require("mongoose");

const session = require("express-session");

const passport = require("passport");

const LocalStrategy = require("passport-local");

const flash = require("connect-flash");

const http = require("http");

const { Server } = require("socket.io");



const setupSocket = require("../socket/socketHandler");

const User = require("../models/User");



const counselorRoutes = require("../routes/counselors");

const userRoutes = require("../routes/users");

const chatRoutes = require("../routes/chat");

const { isStudent, isCounselor, isAdmin, isLoggedIn } = require("../middleware/auth");

const anonymousId = require("../middleware/anonymousId");

const seedAdmin = require("../utils/seedAdmin");



const app = express();

const isProduction = process.env.NODE_ENV === "production";



if (isProduction) {

  app.set("trust proxy", 1);

}



// ================= DB CONNECTION =================

mongoose.set("bufferCommands", false);



function getMongoUrl() {

  const url = process.env.MONGO_URL || process.env.ATLASDB_URL;

  if (!url) {

    throw new Error(

      "MONGO_URL / ATLASDB_URL is not set. Refusing to silently fall back to localhost MongoDB. " +

      "Make sure server/.env exists and contains MONGO_URL."

    );

  }

  return url;

}



async function connectDatabase() {

  const mongoUrl = getMongoUrl();

  const safeUrl = mongoUrl.replace(/\/\/([^:@/]+):([^@/]+)@/, "//***:***@");



  try {

    await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });

    console.log(`MongoDB connected: ${safeUrl}`);

  } catch (err) {

    console.error("MongoDB connection failed:", err.message);

    console.error("Check server/.env MONGO_URL or ATLASDB_URL. The server will not start without a working database.");

    process.exit(1);

  }

}



mongoose.connection.on("disconnected", () => {

  console.warn("MongoDB disconnected");

});



mongoose.connection.on("reconnected", () => {

  console.log("MongoDB reconnected");

});



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

    sameSite: "lax",

    secure: isProduction

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



app.get("/health", (req, res) => {

  res.json({

    success: true,

    dbConnected: mongoose.connection.readyState === 1

  });

});



// ================= ROUTES =================

app.use("/api/ratings", require("../routes/ratings"));

app.use("/api/auth", userRoutes);

app.use("/api/issues", require("../routes/issues"));

app.use("/api/messages", require("../routes/messages"));

app.use("/api/counselors", counselorRoutes);

app.use("/api/chat", chatRoutes);

app.use("/api/recommendations", require("../routes/recommendations"));

app.use("/api/confessions", require("../routes/confessions"));

app.use("/api/admin", require("../routes/admin"));



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



app.get("/admin", isAdmin, (req, res) => {

  res.render("admin", {

    title: "Admin Dashboard",

    user: req.user

  });

});



app.get("/admin-dashboard", isAdmin, (req, res) => {

  res.redirect("/admin");

});



app.get("/chat/:chatId", isLoggedIn, (req, res) => {

  res.render("chat", {

    title: "Chat",

    chatId: req.params.chatId,

    user: req.user

  });

});



app.get("/confession-wall", isLoggedIn, (req, res) => {

  if (["admin", "super_admin"].includes(req.user?.role)) return res.redirect("/admin");

  res.render("index", { title: "Confession Wall", user: req.user || null });

});



app.get("/api/chats", isLoggedIn, (req, res) => {

  res.redirect("/api/chat");

});



// ================= SERVER + SOCKET =================

const server = http.createServer(app);



const io = new Server(server, {

  cors: {

    origin: process.env.CLIENT_ORIGIN || true,

    credentials: true

  },

  transports: ["websocket", "polling"],

  pingTimeout: 30000,

  pingInterval: 25000

});



app.set("io", io);

setupSocket(io);



const PORT = process.env.PORT || 3000;



async function startServer() {

  await connectDatabase();

  await seedAdmin();



  server.listen(PORT, () => {

    console.log(`Server started on http://localhost:${PORT}`);

  });

}



startServer();



server.on("error", (err) => {

  if (err.code === "EADDRINUSE") {

    console.error(`Port ${PORT} already in use!`);

    console.error("   Run this to fix: taskkill /F /IM node.exe");

    console.error("   Then restart: npm start");

    process.exit(1);

  } else {

    console.error("Server error:", err);

  }

});


