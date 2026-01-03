// controllers/matchController.js
const Match = require("../models/Match");
const Tournament = require("../models/Tournament");
const Team = require("../models/Team");
const Player = require("../models/Player");

// Create a new match (metadata only)
exports.createMatch = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const {
      matchNumber,
      team1,
      team2,
      venue,
      date,
      type = "league",
      status = "upcoming",
    } = req.body;

    // Validate required fields
    if (!matchNumber || !team1 || !team2) {
      return res.status(400).json({
        success: false,
        message: "matchNumber, team1, and team2 are required",
      });
    }

    // Check if tournament exists
    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check if teams exist
    const team1Exists = await Team.findOne({ _id: team1, tournament: tournamentId });
    const team2Exists = await Team.findOne({ _id: team2, tournament: tournamentId });

    if (!team1Exists || !team2Exists) {
      return res.status(404).json({
        success: false,
        message: "One or both teams not found in this tournament",
      });
    }

    // Check if teams are different
    if (team1.toString() === team2.toString()) {
      return res.status(400).json({
        success: false,
        message: "Team 1 and Team 2 must be different",
      });
    }

    // Check if match number already exists in tournament
    const existingMatch = await Match.findOne({
      tournament: tournamentId,
      matchNumber,
    });

    if (existingMatch) {
      return res.status(400).json({
        success: false,
        message: `Match number ${matchNumber} already exists in this tournament`,
      });
    }

    // Create match (metadata only - no scoring data yet)
    const match = await Match.create({
      matchNumber,
      tournament: tournamentId,
      team1,
      team2,
      venue,
      date,
      type,
      status,
      // createdBy is automatically added if you add it to schema
    });

    // Populate basic data for response
    await match.populate([
      { path: "tournament", select: "name season" },
      { path: "team1", select: "name shortName logo" },
      { path: "team2", select: "name shortName logo" },
    ]);

    res.status(201).json({
      success: true,
      message: "Match created successfully",
      data: match,
    });
  } catch (error) {
    console.error("Create match error:", error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Match number already exists for this tournament",
      });
    }
    
    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: messages,
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to create match",
      error: error.message,
    });
  }
};

// Get all matches for a tournament
exports.getTournamentMatches = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { status, type, page = 1, limit = 20 } = req.query;

    // Check if tournament exists
    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Build filter
    const filter = { tournament: tournamentId };
    
    if (status) {
      filter.status = status;
    }
    
    if (type) {
      filter.type = type;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalMatches = await Match.countDocuments(filter);

    // Get matches with population
    const matches = await Match.find(filter)
      .populate([
        { path: "tournament", select: "name season" },
        { path: "team1", select: "name shortName logo city" },
        { path: "team2", select: "name shortName logo city" },
        { path: "toss.winner", select: "name shortName" },
        { path: "result.winner", select: "name shortName" },
        { path: "manOfTheMatch", select: "name jerseyNumber" },
      ])
      .sort({ matchNumber: 1, date: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: matches,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalMatches / limit),
        totalMatches,
        hasNextPage: skip + matches.length < totalMatches,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get tournament matches error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch matches",
      error: error.message,
    });
  }
};

// Get single match details
exports.getMatchById = async (req, res) => {
  try {
    const { id } = req.params;

    const match = await Match.findById(id)
      .populate([
        { 
          path: "tournament", 
          select: "name season status oversPerInnings startDate endDate" 
        },
        { 
          path: "team1", 
          select: "name shortName logo city captain viceCaptain",
          populate: [
            { path: "captain", select: "name jerseyNumber" },
            { path: "viceCaptain", select: "name jerseyNumber" },
          ]
        },
        { 
          path: "team2", 
          select: "name shortName logo city captain viceCaptain",
          populate: [
            { path: "captain", select: "name jerseyNumber" },
            { path: "viceCaptain", select: "name jerseyNumber" },
          ]
        },
        { path: "toss.winner", select: "name shortName logo" },
        { path: "result.winner", select: "name shortName logo" },
        { 
          path: "manOfTheMatch", 
          select: "name jerseyNumber role team",
          populate: { path: "team", select: "name shortName" }
        },
      ]);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    res.json({
      success: true,
      data: match,
    });
  } catch (error) {
    console.error("Get match error:", error);
    
    // Handle invalid ObjectId
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid match ID",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch match",
      error: error.message,
    });
  }
};

// Update match status (simple status update)
exports.updateMatchStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = [
      "upcoming",
      "toss",
      "inning1",
      "inning2",
      "completed",
      "abandoned",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Find match
    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Validate status transition
    const currentStatus = match.status;
    const validTransitions = {
      upcoming: ["toss", "abandoned"],
      toss: ["inning1", "abandoned"],
      inning1: ["inning2", "completed", "abandoned"],
      inning2: ["completed", "abandoned"],
      completed: [],
      abandoned: [],
    };

    if (!validTransitions[currentStatus]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${currentStatus} to ${status}`,
      });
    }

    // Update status
    match.status = status;
    
    // If match is completed or abandoned, ensure required fields
    if (status === "completed" && !match.result?.winner) {
      return res.status(400).json({
        success: false,
        message: "Cannot complete match without result. Use updateMatchResult endpoint.",
      });
    }

    await match.save();

    // Populate for response
    await match.populate([
      { path: "team1", select: "name shortName" },
      { path: "team2", select: "name shortName" },
    ]);

    res.json({
      success: true,
      message: `Match status updated to ${status}`,
      data: match,
    });
  } catch (error) {
    console.error("Update match status error:", error);
    
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid match ID",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to update match status",
      error: error.message,
    });
  }
};

// Update toss details
exports.updateToss = async (req, res) => {
  try {
    const { id } = req.params;
    const { winner, decision } = req.body;

    // Validate decision
    if (decision && !["bat", "bowl"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be either 'bat' or 'bowl'",
      });
    }

    // Find match
    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Check if winner is one of the teams
    if (winner && ![match.team1.toString(), match.team2.toString()].includes(winner.toString())) {
      return res.status(400).json({
        success: false,
        message: "Toss winner must be one of the match teams",
      });
    }

    // Update toss
    match.toss = {
      winner: winner || match.toss?.winner,
      decision: decision || match.toss?.decision,
    };

    // Auto-update status to toss if not already
    if (match.status === "upcoming") {
      match.status = "toss";
    }

    await match.save();

    // Populate for response
    await match.populate([
      { path: "toss.winner", select: "name shortName" },
      { path: "team1", select: "name shortName" },
      { path: "team2", select: "name shortName" },
    ]);

    res.json({
      success: true,
      message: "Toss details updated",
      data: match,
    });
  } catch (error) {
    console.error("Update toss error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update toss details",
      error: error.message,
    });
  }
};

// Update match result (for completed matches)
exports.updateMatchResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { winner, margin, summary, manOfTheMatch } = req.body;

    // Find match
    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Check if winner is one of the teams
    if (winner && ![match.team1.toString(), match.team2.toString()].includes(winner.toString())) {
      return res.status(400).json({
        success: false,
        message: "Winner must be one of the match teams",
      });
    }

    // Check if man of the match belongs to one of the teams
    if (manOfTheMatch) {
      const player = await Player.findById(manOfTheMatch);
      if (!player) {
        return res.status(404).json({
          success: false,
          message: "Player not found",
        });
      }
      
      const playerTeamId = player.team.toString();
      if (![match.team1.toString(), match.team2.toString()].includes(playerTeamId)) {
        return res.status(400).json({
          success: false,
          message: "Man of the match must be from one of the match teams",
        });
      }
    }

    // Update result
    match.result = {
      winner: winner || match.result?.winner,
      margin: margin || match.result?.margin,
      summary: summary || match.result?.summary,
    };

    // Update man of the match
    if (manOfTheMatch) {
      match.manOfTheMatch = manOfTheMatch;
    }

    // Auto-update status to completed if result is set
    if (winner && match.status !== "completed" && match.status !== "abandoned") {
      match.status = "completed";
    }

    await match.save();

    // Populate for response
    await match.populate([
      { path: "result.winner", select: "name shortName" },
      { path: "manOfTheMatch", select: "name jerseyNumber" },
      { path: "team1", select: "name shortName" },
      { path: "team2", select: "name shortName" },
    ]);

    res.json({
      success: true,
      message: "Match result updated",
      data: match,
    });
  } catch (error) {
    console.error("Update match result error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update match result",
      error: error.message,
    });
  }
};

// Delete a match (only if no scoring data exists)
exports.deleteMatch = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if match exists
    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Check if match has started (prevent deletion of matches with scoring data)
    if (match.status !== "upcoming") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete match that has already started or completed",
      });
    }

    // Delete match
    await Match.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Match deleted successfully",
    });
  } catch (error) {
    console.error("Delete match error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete match",
      error: error.message,
    });
  }
};