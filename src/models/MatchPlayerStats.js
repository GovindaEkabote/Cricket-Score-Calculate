// models/MatchPlayerStats.js
const mongoose = require("mongoose");

const MatchPlayerStatsSchema = new mongoose.Schema(
  {
    match: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true },
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },

    batting: {
      runs: { type: Number, default: 0 },
      balls: { type: Number, default: 0 },
      fours: { type: Number, default: 0 },
      sixes: { type: Number, default: 0 },
      out: { type: Boolean, default: false },
    },

    bowling: {
      overs: { type: Number, default: 0 },
      runsConceded: { type: Number, default: 0 },
      wickets: { type: Number, default: 0 },
      maidens: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

MatchPlayerStatsSchema.index({ match: 1, player: 1 }, { unique: true });

module.exports = mongoose.model("MatchPlayerStats", MatchPlayerStatsSchema);
