const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const User = require("../models/User");

async function main() {
  const mongoUrl = process.env.MONGO_URL || process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/student_health_system";
  const email = process.env.DEV_LOGIN_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const role = process.env.DEV_LOGIN_ROLE || "counselor";

  if (!email || !password) {
    throw new Error("Set DEV_LOGIN_EMAIL and DEV_LOGIN_PASSWORD in server/.env before seeding.");
  }

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });

  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = role;
    existing.isOnline = false;
    await existing.save();
    await existing.setPassword(password);
    await existing.save();
    console.log(`Updated dev login user: ${email} (${role})`);
  } else {
    const user = new User({ email, role });
    await User.register(user, password);
    console.log(`Created dev login user: ${email} (${role})`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Seed failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
