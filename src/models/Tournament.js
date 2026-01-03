// models/Tournament.js
const mongoose = require("mongoose");

const TournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    season: { type: Number, required: true },
    startDate: Date,
    endDate: Date,
    oversPerInnings: { type: Number, default: 20 },
    status: {
      type: String,
      enum: ["upcoming", "ongoing", "completed"],
      default: "upcoming",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

TournamentSchema.index({ name: 1, season: 1 }, { unique: true });

module.exports = mongoose.model("Tournament", TournamentSchema);
