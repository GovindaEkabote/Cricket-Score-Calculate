// routes/playerRoutes.js
const express = require("express");
const router = express.Router();
const playerController = require("../controllers/playerController");
const { authenticate, authorize } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// POST /teams/:id/players - Add player to team (admin/scorer only)
router.post(
  "/teams/:id/players",
  authorize("admin", "scorer"),
  playerController.addPlayer
);

// POST /teams/:id/players/bulk - Bulk add players (admin/scorer only)
router.post(
  "/teams/:id/players/bulk",
  authorize("admin", "scorer"),
  playerController.bulkAddPlayers
);

// GET /teams/:id/players - Get all players in a team (all roles)
router.get("/teams/:id/players", playerController.getTeamPlayers);

// GET /players/:id - Get player details (all roles)
router.get("/players/:id", playerController.getPlayerDetails);

// PATCH /players/:id - Update player (admin/scorer only)
router.patch(
  "/players/:id",
  authorize("admin", "scorer"),
  playerController.updatePlayer
);

// DELETE /players/:id - Delete player (admin only)
router.delete(
  "/players/:id",
  authorize("admin"),
  playerController.deletePlayer
);

module.exports = router;
