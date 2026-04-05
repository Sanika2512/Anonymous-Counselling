module.exports.isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    // API request आहे का page request?
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ message: "Login required" });
    }
    return res.redirect("/login"); // ← page साठी redirect
};

module.exports.isStudent = (req, res, next) => {
    if (req.isAuthenticated() && req.user.role === "student") {
        return next();
    }
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ message: "Student only" });
    }
    return res.redirect("/login");
};

module.exports.isCounselor = (req, res, next) => {
    if (req.isAuthenticated() && req.user.role === "counselor") {
        return next();
    }
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ message: "Counselor only" });
    }
    return res.redirect("/login");
};