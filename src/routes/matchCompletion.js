// routes/matchCompletion.js
const express = require("express");
const router = express.Router();
const matchCompletionController = require("../controllers/matchCompletionController");
const { authenticate, authorize } = require("../middleware/auth");

// Complete a match (with points table update)
router.post(
  "/matches/:id/complete",
  authenticate,
  authorize("admin", "scorer"),
  matchCompletionController.completeMatch
);

// Get points table for a tournament
router.get(
  "/tournaments/:tournamentId/points-table",
  matchCompletionController.getPointsTable
);

// Abandon a match (no result)
router.post(
  "/matches/:id/abandon",
  authenticate,
  authorize("admin", "scorer"),
  matchCompletionController.abandonMatch
);

// Update match result (manual correction)
router.patch(
  "/matches/:id/result",
  authenticate,
  authorize("admin"),
  matchCompletionController.updateMatchResult
);

module.exports = router;