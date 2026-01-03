// controllers/playerController.js
const Player = require("../models/Player");
const Team = require("../models/Team");
const Match = require("../models/Match");
const Ball = require("../models/Ball");

// Add Player to Team
exports.addPlayer = async (req, res) => {
  try {
    const teamId = req.params.id;
    const { name, jerseyNumber, role, battingStyle, bowlingStyle } = req.body;

    // Check if team exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Check if jersey number is already taken in this team
    const existingPlayer = await Player.findOne({
      team: teamId,
      jerseyNumber,
    });

    if (existingPlayer) {
      return res.status(400).json({
        success: false,
        message: `Jersey number ${jerseyNumber} is already assigned to another player in this team`,
      });
    }

    // Validate role
    const validRoles = ["batsman", "bowler", "all-rounder", "wicket-keeper"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be one of: batsman, bowler, all-rounder, wicket-keeper",
      });
    }

    // Validate batting style
    const validBattingStyles = ["right", "left"];
    if (!validBattingStyles.includes(battingStyle)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batting style. Must be 'right' or 'left'",
      });
    }

    // Create player
    const player = await Player.create({
      name,
      jerseyNumber,
      team: teamId,
      role,
      battingStyle,
      bowlingStyle: bowlingStyle || null,
    });

    // Populate team name for response
    await player.populate("team", "name shortName");

    res.status(201).json({
      success: true,
      message: "Player added successfully",
      data: player,
    });
  } catch (error) {
    console.error("Add player error:", error);

    // Handle duplicate jersey number error (from MongoDB unique index)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Jersey number must be unique within the team",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to add player",
      error: error.message,
    });
  }
};

// Get All Players in a Team
exports.getTeamPlayers = async (req, res) => {
  try {
    const teamId = req.params.id;
    const { role, search, sortBy = "jerseyNumber", sortOrder = "asc" } = req.query;

    // Check if team exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Build query
    const query = { team: teamId };

    // Filter by role if provided
    if (role) {
      query.role = role;
    }

    // Search by name if provided
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get players
    const players = await Player.find(query)
      .sort(sort)
      .select("-__v");

    // Group by role for better organization
    const groupedByRole = {
      batsman: [],
      bowler: [],
      "all-rounder": [],
      "wicket-keeper": [],
    };

    players.forEach(player => {
      if (groupedByRole[player.role]) {
        groupedByRole[player.role].push(player);
      }
    });

    res.json({
      success: true,
      data: {
        team: {
          id: team._id,
          name: team.name,
          shortName: team.shortName,
          totalPlayers: players.length,
        },
        players,
        groupedByRole,
      },
    });
  } catch (error) {
    console.error("Get team players error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch players",
      error: error.message,
    });
  }
};

// Update Player
exports.updatePlayer = async (req, res) => {
  try {
    const playerId = req.params.id;
    const updates = req.body;

    // Find player
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        message: "Player not found",
      });
    }

    // Check if jersey number is being updated
    if (updates.jerseyNumber && updates.jerseyNumber !== player.jerseyNumber) {
      // Check if new jersey number is already taken in the team
      const existingPlayer = await Player.findOne({
        team: player.team,
        jerseyNumber: updates.jerseyNumber,
        _id: { $ne: playerId }, // Exclude current player
      });

      if (existingPlayer) {
        return res.status(400).json({
          success: false,
          message: `Jersey number ${updates.jerseyNumber} is already assigned to another player in this team`,
        });
      }
    }

    // Validate role if being updated
    if (updates.role) {
      const validRoles = ["batsman", "bowler", "all-rounder", "wicket-keeper"];
      if (!validRoles.includes(updates.role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role. Must be one of: batsman, bowler, all-rounder, wicket-keeper",
        });
      }
    }

    // Validate batting style if being updated
    if (updates.battingStyle) {
      const validBattingStyles = ["right", "left"];
      if (!validBattingStyles.includes(updates.battingStyle)) {
        return res.status(400).json({
          success: false,
          message: "Invalid batting style. Must be 'right' or 'left'",
        });
      }
    }

    // Update player
    const updatedPlayer = await Player.findByIdAndUpdate(
      playerId,
      updates,
      { new: true, runValidators: true }
    ).populate("team", "name shortName");

    res.json({
      success: true,
      message: "Player updated successfully",
      data: updatedPlayer,
    });
  } catch (error) {
    console.error("Update player error:", error);

    // Handle duplicate jersey number error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Jersey number must be unique within the team",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update player",
      error: error.message,
    });
  }
};

// Delete Player
exports.deletePlayer = async (req, res) => {
  try {
    const playerId = req.params.id;

    // Find player with team info
    const player = await Player.findById(playerId).populate("team", "tournament");
    if (!player) {
      return res.status(404).json({
        success: false,
        message: "Player not found",
      });
    }

    // Check if player is assigned as captain or vice-captain
    const teamAsCaptain = await Team.findOne({ captain: playerId });
    const teamAsViceCaptain = await Team.findOne({ viceCaptain: playerId });

    if (teamAsCaptain || teamAsViceCaptain) {
      const teamNames = [];
      if (teamAsCaptain) teamNames.push(`captain of ${teamAsCaptain.name}`);
      if (teamAsViceCaptain) teamNames.push(`vice-captain of ${teamAsViceCaptain.name}`);

      return res.status(400).json({
        success: false,
        message: `Cannot delete player. Player is assigned as ${teamNames.join(" and ")}`,
      });
    }

    // Check if player has participated in any matches (by checking Ball collection)
    const hasPlayedInMatch = await Ball.findOne({
      $or: [
        { batsman: playerId },
        { bowler: playerId },
        { nonStriker: playerId },
        { "wicket.playerOut": playerId },
        { "wicket.fielder": playerId },
      ],
    });

    if (hasPlayedInMatch) {
      // Instead of deleting, mark as inactive or just prevent deletion
      return res.status(400).json({
        success: false,
        message: "Cannot delete player who has already participated in matches. Consider marking as inactive instead.",
        suggestion: "Use PATCH /players/:id to update player status instead of deleting",
      });
    }

    // Delete player
    await Player.findByIdAndDelete(playerId);

    res.json({
      success: true,
      message: "Player deleted successfully",
      data: {
        id: playerId,
        name: player.name,
        jerseyNumber: player.jerseyNumber,
      },
    });
  } catch (error) {
    console.error("Delete player error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete player",
      error: error.message,
    });
  }
};

// Get Player Details
exports.getPlayerDetails = async (req, res) => {
  try {
    const playerId = req.params.id;

    const player = await Player.findById(playerId)
      .populate("team", "name shortName logo city")
      .select("-__v");

    if (!player) {
      return res.status(404).json({
        success: false,
        message: "Player not found",
      });
    }

    // Get player's match statistics if needed (can be expanded)
    const matchStats = {
      totalMatches: 0,
      totalRuns: 0,
      totalWickets: 0,
      // Add more stats as needed
    };

    res.json({
      success: true,
      data: {
        player,
        statistics: matchStats,
      },
    });
  } catch (error) {
    console.error("Get player details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch player details",
      error: error.message,
    });
  }
};

// Bulk Add Players
exports.bulkAddPlayers = async (req, res) => {
  try {
    const teamId = req.params.id;
    const { players } = req.body;

    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Players array is required and cannot be empty",
      });
    }

    // Check if team exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Validate each player
    const validRoles = ["batsman", "bowler", "all-rounder", "wicket-keeper"];
    const validBattingStyles = ["right", "left"];
    
    const validatedPlayers = players.map((player, index) => {
      // Check required fields
      if (!player.name || !player.jerseyNumber || !player.role || !player.battingStyle) {
        throw new Error(`Player at index ${index} is missing required fields`);
      }

      // Validate role
      if (!validRoles.includes(player.role)) {
        throw new Error(`Player ${player.name}: Invalid role. Must be one of: batsman, bowler, all-rounder, wicket-keeper`);
      }

      // Validate batting style
      if (!validBattingStyles.includes(player.battingStyle)) {
        throw new Error(`Player ${player.name}: Invalid batting style. Must be 'right' or 'left'`);
      }

      return {
        ...player,
        team: teamId,
        bowlingStyle: player.bowlingStyle || null,
      };
    });

    // Check for duplicate jersey numbers in the request
    const jerseyNumbers = validatedPlayers.map(p => p.jerseyNumber);
    const uniqueJerseys = new Set(jerseyNumbers);
    if (uniqueJerseys.size !== jerseyNumbers.length) {
      return res.status(400).json({
        success: false,
        message: "Duplicate jersey numbers found in the request",
      });
    }

    // Check for existing jersey numbers in the team
    const existingPlayers = await Player.find({
      team: teamId,
      jerseyNumber: { $in: jerseyNumbers },
    });

    if (existingPlayers.length > 0) {
      const takenJerseys = existingPlayers.map(p => p.jerseyNumber);
      return res.status(400).json({
        success: false,
        message: `Some jersey numbers are already taken: ${takenJerseys.join(", ")}`,
        takenJerseys,
      });
    }

    // Insert all players
    const createdPlayers = await Player.insertMany(validatedPlayers);

    res.status(201).json({
      success: true,
      message: `${createdPlayers.length} players added successfully`,
      data: {
        count: createdPlayers.length,
        players: createdPlayers,
      },
    });
  } catch (error) {
    console.error("Bulk add players error:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate jersey numbers found in the team",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to add players",
      error: error.message,
    });
  }
};