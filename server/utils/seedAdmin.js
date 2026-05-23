// server/utils/seedAdmin.js

const User = require("../models/User");

async function seedAdmin() {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const username = process.env.ADMIN_USERNAME || "Admin";

  if (!email || !password) {
    console.warn("⚠️  .env मध्ये ADMIN_EMAIL किंवा ADMIN_PASSWORD नाही — admin create होणार नाही.");
    return;
  }

  try {
   
    const existing = await User.findOne({ email, role: "admin" });
    if (existing) {
      console.log("✅ Admin account already exists:", email);
      return;
    }

    const adminUser = new User({ email, username, role: "admin" });
    await User.register(adminUser, password);
    console.log("✅ Admin account created successfully:", email);

  } catch (err) {
    console.error("❌ Admin seed failed:", err.message);
  }
}

module.exports = seedAdmin;