// controllers/playingXiController.js
const Match = require("../models/Match");
const Team = require("../models/Team");
const Player = require("../models/Player");

// Set playing XI for a match
exports.setPlayingXI = async (req, res) => {
  try {
    const { id } = req.params;
    const { teamId, players } = req.body;

    // Validate required fields
    if (!teamId || !players || !Array.isArray(players)) {
      return res.status(400).json({
        success: false,
        message: "teamId and players array are required",
      });
    }

    // Validate players array
    if (players.length !== 11) {
      return res.status(400).json({
        success: false,
        message: "Playing XI must contain exactly 11 players",
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

    // Check if match status is valid for setting playing XI
    if (match.status !== "toss") {
      return res.status(400).json({
        success: false,
        message: `Cannot set playing XI. Match status must be 'toss'. Current status is '${match.status}'`,
      });
    }

    // Check if team is part of the match
    const teamIdStr = teamId.toString();
    const matchTeam1Id = match.team1.toString();
    const matchTeam2Id = match.team2.toString();

    if (teamIdStr !== matchTeam1Id && teamIdStr !== matchTeam2Id) {
      return res.status(400).json({
        success: false,
        message: "Team is not part of this match",
      });
    }

    // Get team details to validate players
    const team = await Team.findById(teamId).populate("players");
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Validate all players belong to the team
    const teamPlayerIds = team.players ? team.players.map(p => p._id.toString()) : [];
    const invalidPlayers = [];

    for (const playerData of players) {
      if (!teamPlayerIds.includes(playerData.player.toString())) {
        invalidPlayers.push(playerData.player);
      }

      // Validate player data structure
      if (!playerData.player) {
        return res.status(400).json({
          success: false,
          message: "Each player must have a player ID",
        });
      }
    }

    if (invalidPlayers.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some players do not belong to this team",
        invalidPlayers,
      });
    }

    // Validate exactly one captain and at least one wicket-keeper
    const captainCount = players.filter(p => p.isCaptain).length;
    const wicketKeeperCount = players.filter(p => p.isWicketKeeper).length;

    if (captainCount !== 1) {
      return res.status(400).json({
        success: false,
        message: "Playing XI must have exactly one captain",
      });
    }

    if (wicketKeeperCount < 1) {
      return res.status(400).json({
        success: false,
        message: "Playing XI must have at least one wicket-keeper",
      });
    }

    // Set batting order if not provided
    const playersWithBattingOrder = players.map((player, index) => ({
      ...player,
      battingOrder: player.battingOrder || index + 1,
    }));

    // Sort by batting order
    playersWithBattingOrder.sort((a, b) => a.battingOrder - b.battingOrder);

    // Update playing XI for the team
    const teamKey = teamIdStr === matchTeam1Id ? "team1" : "team2";
    
    if (!match.playingXI) {
      match.playingXI = {
        team1: [],
        team2: [],
      };
    }

    match.playingXI[teamKey] = playersWithBattingOrder;

    // Save match
    await match.save();

    // Populate player details for response
    await match.populate([
      {
        path: `playingXI.${teamKey}.player`,
        select: "name jerseyNumber role battingStyle bowlingStyle",
      },
    ]);

    res.json({
      success: true,
      message: `Playing XI set successfully for ${team.name}`,
      data: {
        team: {
          id: team._id,
          name: team.name,
          shortName: team.shortName,
        },
        playingXI: match.playingXI[teamKey],
        totalPlayers: match.playingXI[teamKey].length,
        captain: match.playingXI[teamKey].find(p => p.isCaptain),
        wicketKeepers: match.playingXI[teamKey].filter(p => p.isWicketKeeper),
      },
    });
  } catch (error) {
    console.error("Set playing XI error:", error);
    
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to set playing XI",
      error: error.message,
    });
  }
};

// Get playing XI for a match
exports.getPlayingXI = async (req, res) => {
  try {
    const { id } = req.params;
    const { teamId } = req.query;

    const match = await Match.findById(id)
      .select("playingXI team1 team2 status")
      .populate([
        {
          path: "playingXI.team1.player",
          select: "name jerseyNumber role battingStyle bowlingStyle team",
          populate: {
            path: "team",
            select: "name shortName",
          },
        },
        {
          path: "playingXI.team2.player",
          select: "name jerseyNumber role battingStyle bowlingStyle team",
          populate: {
            path: "team",
            select: "name shortName",
          },
        },
        { path: "team1", select: "name shortName" },
        { path: "team2", select: "name shortName" },
      ]);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // If teamId is specified, return only that team's playing XI
    if (teamId) {
      const teamIdStr = teamId.toString();
      const matchTeam1Id = match.team1._id.toString();
      const matchTeam2Id = match.team2._id.toString();

      if (teamIdStr !== matchTeam1Id && teamIdStr !== matchTeam2Id) {
        return res.status(400).json({
          success: false,
          message: "Team is not part of this match",
        });
      }

      const teamKey = teamIdStr === matchTeam1Id ? "team1" : "team2";
      const teamData = teamKey === "team1" ? match.team1 : match.team2;

      if (!match.playingXI || !match.playingXI[teamKey] || match.playingXI[teamKey].length === 0) {
        return res.status(404).json({
          success: false,
          message: `Playing XI not set yet for ${teamData.name}`,
        });
      }

      return res.json({
        success: true,
        data: {
          team: teamData,
          playingXI: match.playingXI[teamKey],
          status: match.status,
        },
      });
    }

    // Return both teams' playing XI
    const response = {
      success: true,
      data: {
        matchStatus: match.status,
        teams: {},
      },
    };

    if (match.playingXI) {
      if (match.playingXI.team1 && match.playingXI.team1.length > 0) {
        response.data.teams.team1 = {
          team: match.team1,
          playingXI: match.playingXI.team1,
        };
      }

      if (match.playingXI.team2 && match.playingXI.team2.length > 0) {
        response.data.teams.team2 = {
          team: match.team2,
          playingXI: match.playingXI.team2,
        };
      }
    }

    res.json(response);
  } catch (error) {
    console.error("Get playing XI error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch playing XI",
      error: error.message,
    });
  }
};

// Update batting order
exports.updateBattingOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { teamId, battingOrder } = req.body;

    // Validate required fields
    if (!teamId || !battingOrder || !Array.isArray(battingOrder)) {
      return res.status(400).json({
        success: false,
        message: "teamId and battingOrder array are required",
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

    // Check if match status allows batting order changes
    if (match.status !== "toss" && match.status !== "inning1" && match.status !== "inning2") {
      return res.status(400).json({
        success: false,
        message: `Cannot update batting order. Match status is '${match.status}'`,
      });
    }

    // Check if team is part of the match
    const teamIdStr = teamId.toString();
    const matchTeam1Id = match.team1.toString();
    const matchTeam2Id = match.team2.toString();

    if (teamIdStr !== matchTeam1Id && teamIdStr !== matchTeam2Id) {
      return res.status(400).json({
        success: false,
        message: "Team is not part of this match",
      });
    }

    const teamKey = teamIdStr === matchTeam1Id ? "team1" : "team2";

    // Check if playing XI is set
    if (!match.playingXI || !match.playingXI[teamKey] || match.playingXI[teamKey].length === 0) {
      return res.status(400).json({
        success: false,
        message: "Playing XI not set for this team",
      });
    }

    // Validate batting order
    if (battingOrder.length !== match.playingXI[teamKey].length) {
      return res.status(400).json({
        success: false,
        message: `Batting order must contain exactly ${match.playingXI[teamKey].length} players`,
      });
    }

    // Update batting order
    const playerMap = new Map();
    match.playingXI[teamKey].forEach(player => {
      playerMap.set(player.player.toString(), player);
    });

    const updatedPlayers = [];
    for (let i = 0; i < battingOrder.length; i++) {
      const playerId = battingOrder[i];
      const playerData = playerMap.get(playerId.toString());

      if (!playerData) {
        return res.status(400).json({
          success: false,
          message: `Player with ID ${playerId} not found in playing XI`,
        });
      }

      updatedPlayers.push({
        ...playerData,
        battingOrder: i + 1,
      });
    }

    // Update playing XI
    match.playingXI[teamKey] = updatedPlayers;
    await match.save();

    // Populate player details for response
    await match.populate([
      {
        path: `playingXI.${teamKey}.player`,
        select: "name jerseyNumber",
      },
    ]);

    res.json({
      success: true,
      message: "Batting order updated successfully",
      data: {
        playingXI: match.playingXI[teamKey],
      },
    });
  } catch (error) {
    console.error("Update batting order error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update batting order",
      error: error.message,
    });
  }
};