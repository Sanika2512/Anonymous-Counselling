const express = require("express");
const router = express.Router();
const passport = require("passport");
const User = require("../models/User");

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const user = new User({ email, role });
    await User.register(user, password);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

//login
router.post("/login", (req, res, next) => {
  const { email, password, role } = req.body;

  passport.authenticate("local", (err, user) => {
    if (err) return res.json({ success: false, message: "Server error" });

    if (!user) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

    // ✅ ROLE CHECK
    if (user.role !== role) {
      return res.json({
        success: false,
        message: `You are registered as ${user.role}. Please login as ${user.role}.`
      });
    }

   req.logIn(user, async (err) => {
  if (err) return res.json({ success: false, message: "Login failed" });

  // 👇 now this is valid
  if (user.role === "counselor") {
    user.isOnline = true;
    await user.save();
  }

  return res.json({
    success: true,
    user: {
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