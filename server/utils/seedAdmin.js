// server/utils/seedAdmin.js

const User = require("../models/User");

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const username = process.env.ADMIN_USERNAME || "Admin";

  if (!email || !password) {
    console.warn("ADMIN_EMAIL or ADMIN_PASSWORD is missing. Admin account was not seeded.");
    return;
  }

  try {
    const existing = await User.findOne({ email });

    if (existing) {
      existing.username = username;
      existing.role = "admin";
      existing.isOnline = false;
      await existing.save();
      await existing.setPassword(password);
      await existing.save();
      console.log("Admin account updated:", email);
      return;
    }

    const adminUser = new User({ email, username, role: "admin" });
    await User.register(adminUser, password);
    console.log("Admin account created successfully:", email);
  } catch (err) {
    console.error("Admin seed failed:", err.message);
  }
}

module.exports = seedAdmin;
