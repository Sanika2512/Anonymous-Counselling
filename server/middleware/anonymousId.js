const crypto = require("crypto");

module.exports = function(req, res, next) {
    // Skip for authenticated users
    if (req.user) {
        return next();
    }

    // ✅ Prevent crash if session is not available
    if (!req.session) {
        console.log("Session not found!");
        return next();
    }

    // Create anonymous ID if not present
    if (!req.session.anonymousId) {
        const randomId = crypto.randomBytes(3).toString("hex");
        req.session.anonymousId = "Student-" + randomId;
    }

    next();
};