// routes/toss.js
const express = require("express");
const router = express.Router();
const tossController = require("../controllers/tossController");
const playingXiController = require("../controllers/playingXiController");
const { authenticate, authorize } = require("../middleware/auth");

// Toss endpoints
router.post(
  "/matches/:id/toss",
  authenticate,
  authorize("admin", "scorer"),
  tossController.recordToss
);

router.get(
  "/matches/:id/toss",
  tossController.getTossDetails
);

// Playing XI endpoints
router.post(
  "/matches/:id/playing-xi",
  authenticate,
  authorize("admin", "scorer"),
  playingXiController.setPlayingXI
);

router.get(
  "/matches/:id/playing-xi",
  playingXiController.getPlayingXI
);

router.patch(
  "/matches/:id/batting-order",
  authenticate,
  authorize("admin", "scorer"),
  playingXiController.updateBattingOrder
);

module.exports = router;