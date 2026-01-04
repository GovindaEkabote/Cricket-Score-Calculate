// controllers/matchCompletionController.js
const mongoose = require("mongoose");
const Match = require("../models/Match");
const Inning = require("../models/Inning");
const PointsTable = require("../models/PointsTable");
const Tournament = require("../models/Tournament");
const Ball = require("../models/Ball");

// Complete a match and update points table
exports.completeMatch = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id: matchId } = req.params;
    const { winner, margin, summary, manOfTheMatch } = req.body;

    // Find match
    const match = await Match.findById(matchId)
      .populate([
        { path: "team1", select: "name shortName tournament" },
        { path: "team2", select: "name shortName tournament" },
        { path: "tournament", select: "name season oversPerInnings" }
      ])
      .session(session);

    if (!match) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Match not found"
      });
    }

    // Check if match can be completed
    if (match.status === "completed" || match.status === "abandoned") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Match is already ${match.status}`
      });
    }

    // Check if both innings are completed
    const innings = await Inning.find({ match: matchId }).session(session);
    if (innings.length < 2 || !innings.every(inning => inning.isCompleted)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Both innings must be completed before finishing the match"
      });
    }

    // Validate winner is one of the teams
    if (winner) {
      const validWinners = [
        match.team1._id.toString(),
        match.team2._id.toString()
      ];

      if (!validWinners.includes(winner.toString())) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Winner must be one of the match teams"
        });
      }
    }

    // Calculate match result if not provided
    let matchResult = {};
    if (winner) {
      matchResult.winner = winner;
      matchResult.margin = margin || "";
      matchResult.summary = summary || "";
    } else {
      // Auto-calculate result based on innings
      matchResult = await this.calculateMatchResult(match, innings, session);
    }

    // Validate man of the match
    if (manOfTheMatch) {
      const playerTeam = await mongoose.model("Player").findById(manOfTheMatch)
        .select("team")
        .session(session);

      if (!playerTeam) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: "Player not found"
        });
      }

      const playerTeamId = playerTeam.team.toString();
      if (![match.team1._id.toString(), match.team2._id.toString()].includes(playerTeamId)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Man of the match must be from one of the match teams"
        });
      }
    }

    // Update match with result
    match.status = "completed";
    match.result = matchResult;
    
    if (manOfTheMatch) {
      match.manOfTheMatch = manOfTheMatch;
    }

    await match.save({ session });

    // Update points table
    await this.updatePointsTable(match, matchResult, session);

    // Commit transaction
    await session.commitTransaction();

    // Populate for response
    await match.populate([
      { path: "team1", select: "name shortName" },
      { path: "team2", select: "name shortName" },
      { path: "result.winner", select: "name shortName" },
      { path: "manOfTheMatch", select: "name jerseyNumber" },
      { path: "tournament", select: "name season" }
    ]);

    res.json({
      success: true,
      message: "Match completed successfully",
      data: {
        match,
        pointsUpdated: true
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Complete match error:", error);
    
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format"
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to complete match",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Calculate match result based on innings
calculateMatchResult = async (match, innings, session) => {
  const result = {};
  
  // Get inning scores
  const inning1 = innings.find(i => i.inningNumber === 1);
  const inning2 = innings.find(i => i.inningNumber === 2);

  if (!inning1 || !inning2) {
    throw new Error("Both innings data required");
  }

  // Get balls for each inning
  const inning1Balls = await Ball.find({ inning: inning1._id }).session(session);
  const inning2Balls = await Ball.find({ inning: inning2._id }).session(session);

  const inning1Score = inning1Balls.reduce((sum, ball) => sum + ball.runs.total, 0);
  const inning2Score = inning2Balls.reduce((sum, ball) => sum + ball.runs.total, 0);
  
  const inning1Wickets = inning1Balls.reduce((sum, ball) => sum + (ball.wicket.isWicket ? 1 : 0), 0);
  const inning2Wickets = inning2Balls.reduce((sum, ball) => sum + (ball.wicket.isWicket ? 1 : 0), 0);

  // Determine winner
  if (inning2Score > inning1Score) {
    // Team batting second won
    result.winner = inning2.battingTeam;
    const runsDifference = inning2Score - inning1Score;
    result.margin = `${runsDifference} run${runsDifference > 1 ? 's' : ''}`;
    result.summary = `${inning2.battingTeam.name} won by ${runsDifference} runs`;
  } else if (inning2Score < inning1Score) {
    // Team bowling second won
    result.winner = inning2.bowlingTeam;
    const wicketsLeft = 10 - inning2Wickets;
    result.margin = `${wicketsLeft} wicket${wicketsLeft > 1 ? 's' : ''}`;
    result.summary = `${inning2.bowlingTeam.name} won by ${wicketsLeft} wickets`;
  } else {
    // Match tied
    result.summary = "Match tied";
  }

  return result;
};

// Update points table
updatePointsTable = async (match, result, session) => {
  const tournamentId = match.tournament._id;

  // Find or create points table for tournament
  let pointsTable = await PointsTable.findOne({ tournament: tournamentId })
    .populate("standings.team")
    .session(session);

  if (!pointsTable) {
    // Initialize points table with all teams in the tournament
    const teams = await mongoose.model("Team").find({ tournament: tournamentId })
      .select("_id name shortName")
      .session(session);

    pointsTable = new PointsTable({
      tournament: tournamentId,
      standings: teams.map(team => ({
        team: team._id,
        played: 0,
        won: 0,
        lost: 0,
        noResult: 0,
        points: 0,
        netRunRate: 0,
        qualified: false
      }))
    });
  }

  // Update standings for both teams
  const team1Id = match.team1._id.toString();
  const team2Id = match.team2._id.toString();

  // Check if result has a winner (not tied or abandoned)
  if (result.winner) {
    const winnerId = result.winner.toString();
    const loserId = winnerId === team1Id ? team2Id : team1Id;

    // Update winner stats
    const winnerStanding = pointsTable.standings.find(
      standing => standing.team.toString() === winnerId
    );
    
    if (winnerStanding) {
      winnerStanding.played += 1;
      winnerStanding.won += 1;
      winnerStanding.points += 2; // 2 points for a win
    }

    // Update loser stats
    const loserStanding = pointsTable.standings.find(
      standing => standing.team.toString() === loserId
    );
    
    if (loserStanding) {
      loserStanding.played += 1;
      loserStanding.lost += 1;
    }

    // Calculate and update Net Run Rate (NRR)
    await this.calculateNetRunRate(pointsTable, match, result, session);
  } else {
    // Match tied, abandoned, or no result
    const team1Standing = pointsTable.standings.find(
      standing => standing.team.toString() === team1Id
    );
    
    const team2Standing = pointsTable.standings.find(
      standing => standing.team.toString() === team2Id
    );

    if (team1Standing && team2Standing) {
      team1Standing.played += 1;
      team2Standing.played += 1;
      team1Standing.noResult += 1;
      team2Standing.noResult += 1;
      team1Standing.points += 1; // 1 point each for tie/no result
      team2Standing.points += 1;
    }
  }

  // Sort standings by points, then NRR
  pointsTable.standings.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points; // Higher points first
    }
    return b.netRunRate - a.netRunRate; // Higher NRR first
  });

  // Update positions
  pointsTable.standings.forEach((standing, index) => {
    standing.position = index + 1;
  });

  await pointsTable.save({ session });
};

// Calculate Net Run Rate (NRR)
calculateNetRunRate = async (pointsTable, match, result, session) => {
  const innings = await Inning.find({ match: match._id })
    .populate("battingTeam bowlingTeam")
    .session(session);

  const inning1 = innings.find(i => i.inningNumber === 1);
  const inning2 = innings.find(i => i.inningNumber === 2);

  if (!inning1 || !inning2) return;

  // Get balls for each inning
  const inning1Balls = await Ball.find({ inning: inning1._id }).session(session);
  const inning2Balls = await Ball.find({ inning: inning2._id }).session(session);

  const inning1Score = inning1Balls.reduce((sum, ball) => sum + ball.runs.total, 0);
  const inning2Score = inning2Balls.reduce((sum, ball) => sum + ball.runs.total, 0);

  const legalBalls1 = inning1Balls.filter(ball => ball.isLegal).length;
  const legalBalls2 = inning2Balls.filter(ball => ball.isLegal).length;

  const overs1 = legalBalls1 / 6;
  const overs2 = legalBalls2 / 6;

  // Calculate NRR for each team
  const battingTeam1NRR = overs1 > 0 ? (inning1Score / overs1) : 0;
  const bowlingTeam1NRR = overs2 > 0 ? (inning2Score / overs2) : 0;

  const battingTeam2NRR = overs2 > 0 ? (inning2Score / overs2) : 0;
  const bowlingTeam2NRR = overs1 > 0 ? (inning1Score / overs1) : 0;

  // Update NRR for each team in points table
  const team1Standing = pointsTable.standings.find(
    standing => standing.team.toString() === match.team1._id.toString()
  );
  
  const team2Standing = pointsTable.standings.find(
    standing => standing.team.toString() === match.team2._id.toString()
  );

  if (team1Standing && team2Standing) {
    // Team 1 was batting in inning 1
    if (inning1.battingTeam._id.toString() === match.team1._id.toString()) {
      team1Standing.netRunRate += (battingTeam1NRR - bowlingTeam2NRR);
      team2Standing.netRunRate += (battingTeam2NRR - bowlingTeam1NRR);
    } else {
      team1Standing.netRunRate += (battingTeam2NRR - bowlingTeam1NRR);
      team2Standing.netRunRate += (battingTeam1NRR - bowlingTeam2NRR);
    }
  }
};

// Get points table for a tournament
exports.getPointsTable = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found"
      });
    }

    let pointsTable = await PointsTable.findOne({ tournament: tournamentId })
      .populate([
        {
          path: "standings.team",
          select: "name shortName logo city"
        }
      ]);

    if (!pointsTable) {
      // Create initial points table if it doesn't exist
      const teams = await mongoose.model("Team").find({ tournament: tournamentId })
        .select("_id name shortName logo city")
        .sort({ name: 1 });

      pointsTable = {
        tournament: tournamentId,
        standings: teams.map((team, index) => ({
          team,
          played: 0,
          won: 0,
          lost: 0,
          noResult: 0,
          points: 0,
          netRunRate: 0,
          position: index + 1,
          qualified: false
        })),
        lastUpdated: new Date()
      };
    }

    res.json({
      success: true,
      data: pointsTable
    });

  } catch (error) {
    console.error("Get points table error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch points table",
      error: error.message
    });
  }
};

// Abandon a match (no result)
exports.abandonMatch = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id: matchId } = req.params;
    const { reason } = req.body;

    const match = await Match.findById(matchId)
      .populate("team1 team2 tournament")
      .session(session);

    if (!match) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Match not found"
      });
    }

    // Check if match can be abandoned
    if (match.status === "completed") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Cannot abandon a completed match"
      });
    }

    // Update match status
    match.status = "abandoned";
    match.result = {
      summary: reason || "Match abandoned due to weather/other conditions"
    };

    await match.save({ session });

    // Update points table (both teams get 1 point)
    await this.updatePointsTableForAbandonedMatch(match, session);

    await session.commitTransaction();

    // Populate for response
    await match.populate([
      { path: "team1", select: "name shortName" },
      { path: "team2", select: "name shortName" }
    ]);

    res.json({
      success: true,
      message: "Match abandoned successfully",
      data: match
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Abandon match error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to abandon match",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Update points table for abandoned match
updatePointsTableForAbandonedMatch = async (match, session) => {
  const tournamentId = match.tournament._id;

  let pointsTable = await PointsTable.findOne({ tournament: tournamentId })
    .session(session);

  if (!pointsTable) {
    const teams = await mongoose.model("Team").find({ tournament: tournamentId })
      .session(session);

    pointsTable = new PointsTable({
      tournament: tournamentId,
      standings: teams.map(team => ({
        team: team._id,
        played: 0,
        won: 0,
        lost: 0,
        noResult: 0,
        points: 0,
        netRunRate: 0,
        qualified: false
      }))
    });
  }

  const team1Id = match.team1._id.toString();
  const team2Id = match.team2._id.toString();

  const team1Standing = pointsTable.standings.find(
    standing => standing.team.toString() === team1Id
  );
  
  const team2Standing = pointsTable.standings.find(
    standing => standing.team.toString() === team2Id
  );

  if (team1Standing && team2Standing) {
    team1Standing.played += 1;
    team2Standing.played += 1;
    team1Standing.noResult += 1;
    team2Standing.noResult += 1;
    team1Standing.points += 1;
    team2Standing.points += 1;
  }

  await pointsTable.save({ session });
};

// Update match result (for manual corrections)
exports.updateMatchResult = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id: matchId } = req.params;
    const { winner, margin, summary, manOfTheMatch } = req.body;

    const match = await Match.findById(matchId)
      .populate("team1 team2 tournament")
      .session(session);

    if (!match) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Match not found"
      });
    }

    if (match.status !== "completed") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Match must be completed before updating result"
      });
    }

    // Validate winner
    if (winner) {
      const validWinners = [
        match.team1._id.toString(),
        match.team2._id.toString()
      ];

      if (!validWinners.includes(winner.toString())) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Winner must be one of the match teams"
        });
      }

      // Update match result
      match.result = {
        winner: winner,
        margin: margin || match.result?.margin || "",
        summary: summary || match.result?.summary || ""
      };
    }

    if (manOfTheMatch) {
      match.manOfTheMatch = manOfTheMatch;
    }

    await match.save({ session });

    // Recalculate points table if result changed
    if (winner && winner.toString() !== match.result?.winner?.toString()) {
      // This is complex - we need to recalculate the entire tournament points
      // For simplicity, we'll just log this case
      console.warn(`Match ${matchId} result changed, points table may need manual update`);
    }

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Match result updated successfully",
      data: match
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Update match result error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update match result",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};