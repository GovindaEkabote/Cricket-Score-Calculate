// routes/auth.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// Public routes
router.post("/register", authController.register);
router.post("/login", authController.login);

// Protected routes
router.get("/me", authenticate, authController.getCurrentUser);
router.patch("/deactivate", authenticate, authController.deactivateAccount);
router.post("/logout", authenticate, authController.logout);
router.post("/refresh", authController.refreshToken);

module.exports = router;