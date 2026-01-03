// routes/inning.js
const express = require("express");
const router = express.Router();
const inningController = require("../controllers/inningController");
const { authenticate, authorize } = require("../middleware/auth");

// Start a new inning
router.post(
  "/matches/:id/innings/start",
  authenticate,
  authorize("admin", "scorer"),
  inningController.startInning
);

// Get all innings for a match
router.get(
  "/matches/:id/innings",
  inningController.getMatchInnings
);

// Get current inning for a match
router.get(
  "/matches/:id/innings/current",
  inningController.getCurrentInning
);

// Complete an inning
router.post(
  "/innings/:id/complete",
  authenticate,
  authorize("admin", "scorer"),
  inningController.completeInning
);

// Get inning details
router.get(
  "/innings/:id",
  inningController.getInningDetails
);

module.exports = router;