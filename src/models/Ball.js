// models/Ball.js
const mongoose = require("mongoose");

const BallSchema = new mongoose.Schema(
  {
    match: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true },
    inning: { type: mongoose.Schema.Types.ObjectId, ref: "Inning", required: true },
    over: { type: Number, required: true },
    ballInOver: { type: Number, required: true }, // 1–6 (legal balls only)
    isLegal: { type: Boolean, default: true },

    bowler: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    batsman: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    nonStriker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },

    runs: {
      batsman: { type: Number, default: 0 },
      extras: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    extraType: {
      type: String,
      enum: ["wide", "no-ball", "bye", "leg-bye", "penalty"],
    },

    wicket: {
      isWicket: { type: Boolean, default: false },
      type: {
        type: String,
        enum: ["bowled", "caught", "lbw", "run-out", "stumped", "hit-wicket"],
      },
      playerOut: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
      fielder: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
    },

    commentary: String,
  },
  { timestamps: true }
);

BallSchema.index({ inning: 1, over: 1, ballInOver: 1 });

module.exports = mongoose.model("Ball", BallSchema);
