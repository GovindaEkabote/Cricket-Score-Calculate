// models/Team.js
const mongoose = require("mongoose");

const TeamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    shortName: { type: String, required: true },
    city: String,
    logo: String,
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
    viceCaptain: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

TeamSchema.index({ name: 1, tournament: 1 }, { unique: true });

module.exports = mongoose.model("Team", TeamSchema);
