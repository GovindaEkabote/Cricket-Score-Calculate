// routes/ball.js
const express = require("express");
const router = express.Router();
const ballController = require("../controllers/ballController");
const { authenticate, authorize } = require("../middleware/auth");

// Record a ball (with transaction)
router.post(
  "/innings/:inningId/balls",
  authenticate,
  authorize("admin", "scorer"),
  ballController.recordBall
);

// Get balls for an inning
router.get(
  "/innings/:inningId/balls",
  ballController.getInningBalls
);

// Get current over
router.get(
  "/innings/:inningId/balls/current-over",
  ballController.getCurrentOver
);

// Get batting partners
router.get(
  "/innings/:inningId/batting-partners",
  ballController.getBattingPartners
);

// Get ball commentary
router.get(
  "/innings/:inningId/commentary",
  ballController.getBallCommentary
);

// Undo last ball (admin/scorer only)
router.delete(
  "/innings/:inningId/balls/undo",
  authenticate,
  authorize("admin", "scorer"),
  ballController.undoLastBall
);

module.exports = router;