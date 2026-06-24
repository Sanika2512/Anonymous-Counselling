const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const passport = require("passport");
const User = require("../models/User");

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (role === "admin") {
      return res.status(403).json({ success: false, message: "Admin accounts are managed by the system owner." });
    }

    const user = new User({ email, role });
    await User.register(user, password);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// LOGIN
router.post("/login", (req, res, next) => {
  const { email, password, role } = req.body;

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: "Database is not connected. Please check MongoDB and restart the server."
    });
  }

  passport.authenticate("local", (err, user) => {
    if (err) {
      console.error("Login authentication error:", err);
      return res.status(500).json({
        success: false,
        message: "Login service is temporarily unavailable. Please try again after the database reconnects."
      });
    }

    if (!user) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

    if (user.role !== role) {
      return res.json({
        success: false,
        message: `You are registered as ${user.role}. Please login as ${user.role}.`
      });
    }

    req.logIn(user, async (loginErr) => {
      if (loginErr) {
        console.error("Login session error:", loginErr);
        return res.status(500).json({ success: false, message: "Login failed" });
      }

      try {
        if (user.role === "counselor") {
          await User.findByIdAndUpdate(user._id, {
            isOnline: true,
            lastSeen: Date.now()
          });
        }
      } catch (updateErr) {
        console.error("Login status update error:", updateErr);
      }

      return res.json({
        success: true,
        user: {
          id: user._id,
          email: user.email,
          role: user.role
        }
      });
    });
  })(req, res, next);
});

// LOGOUT
router.get("/logout", async (req, res) => {
  if (req.user && req.user.role === "counselor") {
    await User.findByIdAndUpdate(req.user._id, { isOnline: false });
  }

  req.logout(() => {
    res.redirect("/login");
  });
});

module.exports = router;
