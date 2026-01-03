// models/Player.js
const mongoose = require("mongoose");

const PlayerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    jerseyNumber: { type: Number, required: true },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    role: {
      type: String,
      enum: ["batsman", "bowler", "all-rounder", "wicket-keeper"],
      required: true,
    },
    battingStyle: { type: String, enum: ["right", "left"], required: true },
    bowlingStyle: { type: String },
  },
  { timestamps: true }
);

PlayerSchema.index({ team: 1, jerseyNumber: 1 }, { unique: true });

module.exports = mongoose.model("Player", PlayerSchema);
