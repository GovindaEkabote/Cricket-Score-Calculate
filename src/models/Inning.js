// models/Inning.js
const mongoose = require("mongoose");

const InningSchema = new mongoose.Schema(
  {
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: true,
    },
    inningNumber: { type: Number, enum: [1, 2], required: true },
    battingTeam: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    bowlingTeam: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    target: Number,
    isCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

InningSchema.index({ match: 1, inningNumber: 1 }, { unique: true });

module.exports = mongoose.model("Inning", InningSchema);
