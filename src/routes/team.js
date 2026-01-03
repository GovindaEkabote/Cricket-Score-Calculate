// routes/team.js
const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");
const { authenticate, authorize } = require("../middleware/auth");

// Public routes
router.get("/tournaments/:id/teams", teamController.getTeamsByTournament);
router.get("/teams/:id", teamController.getTeamById);
router.get("/teams/:id/squad", teamController.getTeamSquad);
router.get("/search", teamController.searchTeams);

// Protected routes (admin/scorer)
router.post(
  "/tournaments/:id/teams",
  authenticate,
  authorize("admin", "scorer"),
  teamController.createTeam
);

router.patch(
  "/teams/:id",
  authenticate,
  authorize("admin", "scorer"),
  teamController.updateTeam
);

// Admin only routes
router.delete(
  "/teams/:id",
  authenticate,
  authorize("admin"),
  teamController.deleteTeam
);

module.exports = router;