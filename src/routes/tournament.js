// routes/tournament.js
const express = require("express");
const router = express.Router();
const tournamentController = require("../controllers/tournamentController");
const { authenticate, authorize } = require("../middleware/auth");

// Public routes
router.get("/", tournamentController.getAllTournaments);
router.get("/:id", tournamentController.getTournament);
router.get("/:id/stats", tournamentController.getTournamentStats);

// Admin only routes
router.post(
  "/",
  authenticate,
  authorize("admin"),
  tournamentController.createTournament
);

router.patch(
  "/:id",
  authenticate,
  authorize("admin"),
  tournamentController.updateTournament
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  tournamentController.deleteTournament
);

module.exports = router;