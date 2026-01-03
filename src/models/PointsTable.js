// models/PointsTable.js
const mongoose = require("mongoose");

const PointsTableSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      unique: true,
    },
    standings: [
      {
        team: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
        played: { type: Number, default: 0 },
        won: { type: Number, default: 0 },
        lost: { type: Number, default: 0 },
        noResult: { type: Number, default: 0 },
        points: { type: Number, default: 0 },
        netRunRate: { type: Number, default: 0 },
        position: Number,
        qualified: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("PointsTable", PointsTableSchema);
