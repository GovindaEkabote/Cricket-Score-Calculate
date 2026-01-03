// routes/match.js
const express = require("express");
const router = express.Router();
const matchController = require("../controllers/matchController");
const { authenticate, authorize } = require("../middleware/auth");

// Create a match (admin/scorer only)
router.post(
  "/tournaments/:tournamentId/matches",
  authenticate,
  authorize("admin", "scorer"),
  matchController.createMatch
);

// Get all matches for a tournament (public)
router.get(
  "/tournaments/:tournamentId/matches",
  matchController.getTournamentMatches
);

// Get single match (public)
router.get("/matches/:id", matchController.getMatchById);

// Update match status (admin/scorer only)
router.patch(
  "/matches/:id/status",
  authenticate,
  authorize("admin", "scorer"),
  matchController.updateMatchStatus
);

// Update toss details (admin/scorer only)
router.patch(
  "/matches/:id/toss",
  authenticate,
  authorize("admin", "scorer"),
  matchController.updateToss
);

// Update match result (admin/scorer only)
router.patch(
  "/matches/:id/result",
  authenticate,
  authorize("admin", "scorer"),
  matchController.updateMatchResult
);

// Delete match (admin only)
router.delete(
  "/matches/:id",
  authenticate,
  authorize("admin"),
  matchController.deleteMatch
);

module.exports = router;