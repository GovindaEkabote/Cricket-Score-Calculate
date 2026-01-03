// controllers/tossController.js
const Match = require("../models/Match");

// Record toss details
exports.recordToss = async (req, res) => {
  try {
    const { id } = req.params;
    const { winner, decision } = req.body;

    // Validate required fields
    if (!winner || !decision) {
      return res.status(400).json({
        success: false,
        message: "Winner and decision are required",
      });
    }

    // Validate decision
    if (!["bat", "bowl"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be either 'bat' or 'bowl'",
      });
    }

    // Find match
    const match = await Match.findById(id).populate([
      { path: "team1", select: "name shortName" },
      { path: "team2", select: "name shortName" },
    ]);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Check if match status is valid for toss
    if (match.status !== "upcoming" && match.status !== "toss") {
      return res.status(400).json({
        success: false,
        message: `Cannot record toss. Current match status is '${match.status}'`,
      });
    }

    // Check if toss winner is one of the match teams
    const team1Id = match.team1._id.toString();
    const team2Id = match.team2._id.toString();
    const winnerId = winner.toString();

    if (winnerId !== team1Id && winnerId !== team2Id) {
      return res.status(400).json({
        success: false,
        message: "Toss winner must be one of the match teams",
      });
    }

    // Determine batting and bowling teams based on toss
    const battingTeam = decision === "bat" ? winnerId : (winnerId === team1Id ? team2Id : team1Id);
    const bowlingTeam = decision === "bowl" ? winnerId : (winnerId === team1Id ? team2Id : team1Id);

    // Update toss details and match status
    match.toss = {
      winner,
      decision,
    };

    // Update match status to toss
    match.status = "toss";

    // Save match
    await match.save();

    // Populate toss winner for response
    await match.populate([
      { path: "toss.winner", select: "name shortName logo" },
    ]);

    res.json({
      success: true,
      message: "Toss recorded successfully",
      data: {
        toss: match.toss,
        matchStatus: match.status,
        battingTeam: {
          id: battingTeam,
          name: battingTeam === team1Id ? match.team1.name : match.team2.name,
          shortName: battingTeam === team1Id ? match.team1.shortName : match.team2.shortName,
        },
        bowlingTeam: {
          id: bowlingTeam,
          name: bowlingTeam === team1Id ? match.team1.name : match.team2.name,
          shortName: bowlingTeam === team1Id ? match.team1.shortName : match.team2.shortName,
        },
      },
    });
  } catch (error) {
    console.error("Record toss error:", error);
    
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to record toss",
      error: error.message,
    });
  }
};

// Get toss details
exports.getTossDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const match = await Match.findById(id)
      .select("toss status team1 team2")
      .populate([
        { path: "toss.winner", select: "name shortName logo" },
        { path: "team1", select: "name shortName" },
        { path: "team2", select: "name shortName" },
      ]);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    if (!match.toss || !match.toss.winner) {
      return res.status(404).json({
        success: false,
        message: "Toss not recorded yet",
      });
    }

    // Determine batting and bowling teams
    let battingTeam = null;
    let bowlingTeam = null;

    if (match.toss.winner && match.toss.decision) {
      const team1Id = match.team1._id.toString();
      const team2Id = match.team2._id.toString();
      const winnerId = match.toss.winner._id.toString();

      battingTeam = match.toss.decision === "bat" ? 
        (winnerId === team1Id ? match.team1 : match.team2) : 
        (winnerId === team1Id ? match.team2 : match.team1);
      
      bowlingTeam = match.toss.decision === "bowl" ? 
        (winnerId === team1Id ? match.team1 : match.team2) : 
        (winnerId === team1Id ? match.team2 : match.team1);
    }

    res.json({
      success: true,
      data: {
        toss: match.toss,
        matchStatus: match.status,
        battingTeam,
        bowlingTeam,
      },
    });
  } catch (error) {
    console.error("Get toss error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch toss details",
      error: error.message,
    });
  }
};