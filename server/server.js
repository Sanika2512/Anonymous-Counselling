const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo");
require("dotenv").config();

const MONGO_URL = "mongodb://127.0.0.1:27017/hopeline";

main()
  .then(() => console.log("connected to DB"))
  .catch(err => console.log(err));

async function main() {
  await mongoose.connect(MONGO_URL);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || "hopeline_secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URL }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// ✅ Create HTTP server
const server = http.createServer(app);

// ✅ Attach Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ✅ Make io accessible in all routes
app.set("io", io);

// ✅ Initialize socket handlers
const socketHandler = require("./socket");
socketHandler(io);

// Your existing routes here...
app.get("/", (req, res) => {
  res.render("index", {
    title: "Home",
    currentUrl: req.path,
    user: null
  });
});

const chatRoutes = require("./routes/chat");
app.use("/api/chat", chatRoutes);

// ✅ Single listen call on port 5000
server.listen(5000, () => {
  console.log("Server + Socket.IO running on port 5000");
});