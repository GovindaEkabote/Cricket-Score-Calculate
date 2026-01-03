// controllers/teamController.js
const Team = require("../models/Team");
const Tournament = require("../models/Tournament");
const Player = require("../models/Player");

// Create Team in Tournament
exports.createTeam = async (req, res) => {
  try {
    const { id: tournamentId } = req.params;
    const { name, shortName, city, logo, captain, viceCaptain } = req.body;

    // Validate tournament exists
    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check if user has permission (admin or scorer)
    if (req.user.role !== "admin" && req.user.role !== "scorer") {
      return res.status(403).json({
        success: false,
        message: "Only admin or scorer can create teams",
      });
    }

    // Check if team name already exists in this tournament
    const existingTeam = await Team.findOne({
      name,
      tournament: tournamentId,
    });

    if (existingTeam) {
      return res.status(400).json({
        success: false,
        message: `Team '${name}' already exists in this tournament`,
      });
    }

    // Validate captain and viceCaptain if provided
    if (captain) {
      const captainPlayer = await Player.findById(captain);
      if (!captainPlayer) {
        return res.status(400).json({
          success: false,
          message: "Captain player not found",
        });
      }
    }

    if (viceCaptain) {
      const viceCaptainPlayer = await Player.findById(viceCaptain);
      if (!viceCaptainPlayer) {
        return res.status(400).json({
          success: false,
          message: "Vice-captain player not found",
        });
      }
    }

    // Create team
    const team = await Team.create({
      name,
      shortName,
      city,
      logo,
      tournament: tournamentId,
      captain: captain || null,
      viceCaptain: viceCaptain || null,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: "Team created successfully",
      data: team,
    });
  } catch (error) {
    console.error("Create team error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create team",
      error: error.message,
    });
  }
};

// Get All Teams in Tournament
exports.getTeamsByTournament = async (req, res) => {
  try {
    const { id: tournamentId } = req.params;
    const { withPlayers, page = 1, limit = 20 } = req.query;

    // Validate tournament exists
    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Build query
    let query = Team.find({ tournament: tournamentId });

    // Include players if requested
    if (withPlayers === "true") {
      query = query.populate({
        path: "players",
        select: "name jerseyNumber role",
      });
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const teams = await query
      .populate("captain", "name jerseyNumber")
      .populate("viceCaptain", "name jerseyNumber")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    // Get total count for pagination
    const total = await Team.countDocuments({ tournament: tournamentId });

    res.json({
      success: true,
      data: teams,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Get teams error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch teams",
      error: error.message,
    });
  }
};

// Get Single Team
exports.getTeamById = async (req, res) => {
  try {
    const { id } = req.params;
    const { withSquad, withMatches } = req.query;

    const team = await Team.findById(id)
      .populate("tournament", "name season")
      .populate("captain", "name jerseyNumber role")
      .populate("viceCaptain", "name jerseyNumber role");

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Get squad players if requested
    if (withSquad === "true") {
      const players = await Player.find({ team: id })
        .select("name jerseyNumber role battingStyle bowlingStyle")
        .sort({ jerseyNumber: 1 });
      
      team._doc.players = players;
    }

    // Get upcoming matches if requested
    if (withMatches === "true") {
      const Match = require("../models/Match");
      const matches = await Match.find({
        $or: [{ team1: id }, { team2: id }],
      })
        .populate("team1", "name shortName")
        .populate("team2", "name shortName")
        .populate("venue")
        .sort({ date: 1 })
        .limit(5);
      
      team._doc.upcomingMatches = matches;
    }

    res.json({
      success: true,
      data: team,
    });
  } catch (error) {
    console.error("Get team error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch team",
      error: error.message,
    });
  }
};

// Update Team
exports.updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Find team
    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Check permission - only admin or team creator can update
    if (req.user.role !== "admin" && team.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this team",
      });
    }

    // If updating name, check for duplicates in same tournament
    if (updates.name && updates.name !== team.name) {
      const existingTeam = await Team.findOne({
        name: updates.name,
        tournament: team.tournament,
        _id: { $ne: id }, // Exclude current team
      });

      if (existingTeam) {
        return res.status(400).json({
          success: false,
          message: `Team '${updates.name}' already exists in this tournament`,
        });
      }
    }

    // Validate captain and viceCaptain if updating
    if (updates.captain) {
      const captainPlayer = await Player.findById(updates.captain);
      if (!captainPlayer) {
        return res.status(400).json({
          success: false,
          message: "Captain player not found",
        });
      }
      // Verify player belongs to this team
      if (captainPlayer.team.toString() !== id) {
        return res.status(400).json({
          success: false,
          message: "Captain must be from the same team",
        });
      }
    }

    if (updates.viceCaptain) {
      const viceCaptainPlayer = await Player.findById(updates.viceCaptain);
      if (!viceCaptainPlayer) {
        return res.status(400).json({
          success: false,
          message: "Vice-captain player not found",
        });
      }
      // Verify player belongs to this team
      if (viceCaptainPlayer.team.toString() !== id) {
        return res.status(400).json({
          success: false,
          message: "Vice-captain must be from the same team",
        });
      }
    }

    // Update team
    Object.keys(updates).forEach((key) => {
      team[key] = updates[key];
    });

    await team.save();

    // Get updated team with populated fields
    const updatedTeam = await Team.findById(id)
      .populate("tournament", "name season")
      .populate("captain", "name jerseyNumber")
      .populate("viceCaptain", "name jerseyNumber");

    res.json({
      success: true,
      message: "Team updated successfully",
      data: updatedTeam,
    });
  } catch (error) {
    console.error("Update team error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update team",
      error: error.message,
    });
  }
};

// Delete Team (Soft delete - only admin)
exports.deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    // Only admin can delete teams
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can delete teams",
      });
    }

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Check if team has players
    const playerCount = await Player.countDocuments({ team: id });
    if (playerCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete team with players. Remove players first.",
      });
    }

    // Check if team has matches scheduled
    const Match = require("../models/Match");
    const matchCount = await Match.countDocuments({
      $or: [{ team1: id }, { team2: id }],
      status: { $in: ["upcoming", "toss", "inning1", "inning2"] },
    });

    if (matchCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete team with scheduled matches",
      });
    }

    await team.deleteOne();

    res.json({
      success: true,
      message: "Team deleted successfully",
    });
  } catch (error) {
    console.error("Delete team error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete team",
      error: error.message,
    });
  }
};

// Get Team Squad (All Players)
exports.getTeamSquad = async (req, res) => {
  try {
    const { id: teamId } = req.params;
    const { role, sortBy = "jerseyNumber", sortOrder = "asc" } = req.query;

    // Verify team exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Build query
    const query = { team: teamId };
    if (role) {
      query.role = role;
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const players = await Player.find(query)
      .select("name jerseyNumber role battingStyle bowlingStyle")
      .sort(sort);

    res.json({
      success: true,
      data: {
        team: {
          id: team._id,
          name: team.name,
          shortName: team.shortName,
        },
        players,
        count: players.length,
      },
    });
  } catch (error) {
    console.error("Get squad error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch team squad",
      error: error.message,
    });
  }
};

// Search Teams
exports.searchTeams = async (req, res) => {
  try {
    const { tournamentId, name, city, page = 1, limit = 20 } = req.query;

    // Build search query
    const query = {};

    if (tournamentId) {
      query.tournament = tournamentId;
    }

    if (name) {
      query.name = { $regex: name, $options: "i" };
    }

    if (city) {
      query.city = { $regex: city, $options: "i" };
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const teams = await Team.find(query)
      .populate("tournament", "name season")
      .populate("captain", "name jerseyNumber")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await Team.countDocuments(query);

    res.json({
      success: true,
      data: teams,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Search teams error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search teams",
      error: error.message,
    });
  }
};