// models/MatchPlayerStats.js - Enhanced version
const mongoose = require("mongoose");

const MatchPlayerStatsSchema = new mongoose.Schema(
  {
    match: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Match", 
      required: true,
      index: true
    },
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    team: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Team",
      required: true 
    },

    // Enhanced batting stats
    batting: {
      runs: { type: Number, default: 0 },
      balls: { type: Number, default: 0 },
      minutes: { type: Number, default: 0 }, // Time at crease
      fours: { type: Number, default: 0 },
      sixes: { type: Number, default: 0 },
      out: { type: Boolean, default: false },
      dismissal: {
        type: String,
        enum: ["bowled", "caught", "lbw", "run-out", "stumped", "hit-wicket", "not-out", "retired", "absent"]
      },
      fielder: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
      strikerate: { type: Number, default: 0 }, // Auto-calculated
    },

    // Enhanced bowling stats
    bowling: {
      overs: { type: Number, default: 0 }, // Decimal overs (e.g., 3.2 for 3 overs 2 balls)
      balls: { type: Number, default: 0 }, // Total balls bowled
      runsConceded: { type: Number, default: 0 },
      wickets: { type: Number, default: 0 },
      maidens: { type: Number, default: 0 },
      wides: { type: Number, default: 0 },
      noBalls: { type: Number, default: 0 },
      economy: { type: Number, default: 0 }, // Auto-calculated
      average: { type: Number, default: 0 }, // Auto-calculated
    },

    // Fielding stats
    fielding: {
      catches: { type: Number, default: 0 },
      runOuts: { type: Number, default: 0 },
      stumpings: { type: Number, default: 0 },
    },

    // Inning-specific stats
    inningNumber: { type: Number, enum: [1, 2] },
    battingPosition: { type: Number },
    bowlingOrder: { type: Number },

    // Performance metrics
    impactPoints: { type: Number, default: 0 }, // For fantasy/analysis
    manOfTheMatch: { type: Boolean, default: false },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for strike rate
MatchPlayerStatsSchema.virtual('batting.strikerate').get(function() {
  if (this.batting.balls === 0) return 0;
  return ((this.batting.runs / this.batting.balls) * 100).toFixed(2);
});

// Virtual for bowling economy
MatchPlayerStatsSchema.virtual('bowling.economy').get(function() {
  if (this.bowling.overs === 0) return 0;
  return (this.bowling.runsConceded / this.bowling.overs).toFixed(2);
});

// Virtual for bowling average
MatchPlayerStatsSchema.virtual('bowling.average').get(function() {
  if (this.bowling.wickets === 0) return 0;
  return (this.bowling.runsConceded / this.bowling.wickets).toFixed(2);
});

// Compound index for unique player per match
MatchPlayerStatsSchema.index({ match: 1, player: 1 }, { unique: true });

// Index for team performance queries
MatchPlayerStatsSchema.index({ match: 1, team: 1 });

// Index for tournament-wide player stats
MatchPlayerStatsSchema.index({ player: 1, 'batting.runs': -1 });

module.exports = mongoose.model("MatchPlayerStats", MatchPlayerStatsSchema);