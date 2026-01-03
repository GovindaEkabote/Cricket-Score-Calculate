// models/Match.js
const mongoose = require("mongoose");

const MatchSchema = new mongoose.Schema(
  {
    matchNumber: { type: Number, required: true },
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    team1: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    team2: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    venue: String,
    date: Date,
    type: {
      type: String,
      enum: ["league", "qualifier", "eliminator", "final"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "upcoming",
        "toss",
        "inning1",
        "inning2",
        "completed",
        "abandoned",
      ],
      default: "upcoming",
    },
    toss: {
      winner: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
      decision: { type: String, enum: ["bat", "bowl"] },
    },
    playingXI: {
      team1: [
        {
          player: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
          isCaptain: { type: Boolean, default: false },
          isWicketKeeper: { type: Boolean, default: false },
          battingOrder: { type: Number },
        }
      ],
      team2: [
        {
          player: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
          isCaptain: { type: Boolean, default: false },
          isWicketKeeper: { type: Boolean, default: false },
          battingOrder: { type: Number },
        }
      ]
    },
    result: {
      winner: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
      margin: String,
      summary: String,
    },
    manOfTheMatch: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
  },
  { timestamps: true }
);

MatchSchema.index({ tournament: 1, matchNumber: 1 }, { unique: true });

module.exports = mongoose.model("Match", MatchSchema);
