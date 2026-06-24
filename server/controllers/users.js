const User = require("../models/User");
const AccessCode = require("../models/AccessCode");

// RENDER SIGNUP
module.exports.renderSignupForm = (req, res) => {
  res.render("users/signup.ejs");
};

//SIGNUP
module.exports.signup = async (req, res, next) => {
  try {
    const { username, email, password, role, accessCode } = req.body;

    let foundCode; 

    
    if (role === "counselor") {
      foundCode = await AccessCode.findOne({
        code: accessCode,
        used: false
      });

      if (!foundCode) {
        return res.json({
          success: false,
          message: "Invalid or already used counselor access code"
        });
      }
    }

    
    const newUser = new User({ username, email, role });
    const registeredUser = await User.register(newUser, password);

    
    if (role === "counselor") {
      foundCode.used = true;
      await foundCode.save();
    }

    req.login(registeredUser, (err) => {
      if (err) return next(err);

      return res.json({
        success: true
      });
    });

  } catch (e) {
    return res.json({
      success: false,
      message: e.message
    });
  }
};

// LOGIN
module.exports.login = (req, res) => {
  req.flash("success", "Welcome to Anonymous Counselling!");

  if (req.user.role === "admin") {
    res.redirect("/admin");
  } else if (req.user.role === "student") {
    res.redirect("/student-dashboard");
  } else {
    res.redirect("/counselor-dashboard");
  }
};

// LOGOUT
module.exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);

    req.flash("success", "You are logged out");
    res.redirect("/");
  });
};
