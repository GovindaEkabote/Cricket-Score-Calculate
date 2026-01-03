// controllers/inningController.js
const Inning = require("../models/Inning");
const Match = require("../models/Match");
const Ball = require("../models/Ball");

// Start a new inning
exports.startInning = async (req, res) => {
  try {
    const { id: matchId } = req.params;
    const { inningNumber, battingTeamId } = req.body;

    // Validate required fields
    if (!inningNumber || !battingTeamId) {
      return res.status(400).json({
        success: false,
        message: "inningNumber and battingTeamId are required",
      });
    }

    // Validate inning number
    if (![1, 2].includes(inningNumber)) {
      return res.status(400).json({
        success: false,
        message: "inningNumber must be 1 or 2",
      });
    }

    // Find match
    const match = await Match.findById(matchId)
      .populate([
        { path: "team1", select: "name shortName" },
        { path: "team2", select: "name shortName" },
        { path: "playingXI.team1.player", select: "name jerseyNumber" },
        { path: "playingXI.team2.player", select: "name jerseyNumber" },
      ]);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Check match status
    if (match.status !== "toss" && match.status !== "inning1" && match.status !== "inning2") {
      return res.status(400).json({
        success: false,
        message: `Cannot start inning. Match status is '${match.status}'`,
      });
    }

    // Check if playing XI is set for both teams
    if (!match.playingXI || 
        !match.playingXI.team1 || match.playingXI.team1.length === 0 ||
        !match.playingXI.team2 || match.playingXI.team2.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Playing XI must be set for both teams before starting an inning",
      });
    }

    // Validate batting team
    const battingTeamIdStr = battingTeamId.toString();
    const matchTeam1Id = match.team1._id.toString();
    const matchTeam2Id = match.team2._id.toString();

    if (battingTeamIdStr !== matchTeam1Id && battingTeamIdStr !== matchTeam2Id) {
      return res.status(400).json({
        success: false,
        message: "Batting team must be one of the match teams",
      });
    }

    // Determine batting and bowling teams based on inning number and toss
    let battingTeam, bowlingTeam, target;

    if (inningNumber === 1) {
      // First inning: batting team is based on toss
      if (match.toss && match.toss.winner && match.toss.decision) {
        const tossWinnerId = match.toss.winner.toString();
        if (match.toss.decision === "bat") {
          battingTeam = tossWinnerId === matchTeam1Id ? match.team1._id : match.team2._id;
          bowlingTeam = tossWinnerId === matchTeam1Id ? match.team2._id : match.team1._id;
        } else {
          battingTeam = tossWinnerId === matchTeam1Id ? match.team2._id : match.team1._id;
          bowlingTeam = tossWinnerId === matchTeam1Id ? match.team1._id : match.team2._id;
        }
      } else {
        // If no toss recorded, use provided batting team
        battingTeam = battingTeamId;
        bowlingTeam = battingTeamIdStr === matchTeam1Id ? match.team2._id : match.team1._id;
      }
    } else {
      // Second inning: opposite of first inning
      
      // Check if first inning exists and is completed
      const firstInning = await Inning.findOne({ 
        match: matchId, 
        inningNumber: 1 
      });

      if (!firstInning) {
        return res.status(400).json({
          success: false,
          message: "First inning must be completed before starting second inning",
        });
      }

      if (!firstInning.isCompleted) {
        return res.status(400).json({
          success: false,
          message: "First inning must be completed before starting second inning",
        });
      }

      // Get first inning total runs to calculate target
      const firstInningBalls = await Ball.find({ inning: firstInning._id });
      const firstInningTotal = firstInningBalls.reduce((sum, ball) => sum + ball.runs.total, 0);
      
      // Target is first inning total + 1
      target = firstInningTotal + 1;

      // Batting team is opposite of first inning batting team
      const firstInningBattingTeam = firstInning.battingTeam.toString();
      battingTeam = firstInningBattingTeam === matchTeam1Id ? match.team2._id : match.team1._id;
      bowlingTeam = firstInningBattingTeam === matchTeam1Id ? match.team1._id : match.team2._id;
    }

    // Check if inning already exists
    const existingInning = await Inning.findOne({
      match: matchId,
      inningNumber,
    });

    if (existingInning) {
      return res.status(400).json({
        success: false,
        message: `Inning ${inningNumber} already started`,
        data: existingInning,
      });
    }

    // Create inning
    const inning = await Inning.create({
      match: matchId,
      inningNumber,
      battingTeam,
      bowlingTeam,
      target: inningNumber === 2 ? target : undefined,
    });

    // Update match status
    if (inningNumber === 1) {
      match.status = "inning1";
    } else if (inningNumber === 2) {
      match.status = "inning2";
    }
    
    await match.save();

    // Populate for response
    await inning.populate([
      { path: "battingTeam", select: "name shortName" },
      { path: "bowlingTeam", select: "name shortName" },
      { path: "match", select: "matchNumber venue date" },
    ]);

    res.status(201).json({
      success: true,
      message: `Inning ${inningNumber} started successfully`,
      data: inning,
    });
  } catch (error) {
    console.error("Start inning error:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Inning already exists for this match",
      });
    }
    
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to start inning",
      error: error.message,
    });
  }
};

// Get all innings for a match
exports.getMatchInnings = async (req, res) => {
  try {
    const { id: matchId } = req.params;

    // Check if match exists
    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Get innings
    const innings = await Inning.find({ match: matchId })
      .populate([
        { path: "battingTeam", select: "name shortName logo" },
        { path: "bowlingTeam", select: "name shortName logo" },
      ])
      .sort({ inningNumber: 1 });

    // Get match summary for each inning
    const inningsWithSummary = await Promise.all(
      innings.map(async (inning) => {
        const balls = await Ball.find({ inning: inning._id });
        
        const totalRuns = balls.reduce((sum, ball) => sum + ball.runs.total, 0);
        const totalWickets = balls.reduce((sum, ball) => sum + (ball.wicket.isWicket ? 1 : 0), 0);
        
        // Calculate overs (each over has 6 legal balls)
        const legalBalls = balls.filter(ball => ball.isLegal).length;
        const overs = Math.floor(legalBalls / 6);
        const ballsInCurrentOver = legalBalls % 6;
        
        return {
          ...inning.toObject(),
          summary: {
            totalRuns,
            totalWickets,
            overs: `${overs}.${ballsInCurrentOver}`,
            runRate: overs > 0 ? (totalRuns / overs).toFixed(2) : 0,
          },
        };
      })
    );

    res.json({
      success: true,
      data: inningsWithSummary,
      matchStatus: match.status,
    });
  } catch (error) {
    console.error("Get innings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch innings",
      error: error.message,
    });
  }
};

// Complete an inning
exports.completeInning = async (req, res) => {
  try {
    const { id: inningId } = req.params;

    // Find inning
    const inning = await Inning.findById(inningId)
      .populate([
        { path: "match", select: "status team1 team2" },
        { path: "battingTeam", select: "name shortName" },
        { path: "bowlingTeam", select: "name shortName" },
      ]);

    if (!inning) {
      return res.status(404).json({
        success: false,
        message: "Inning not found",
      });
    }

    // Check if inning is already completed
    if (inning.isCompleted) {
      return res.status(400).json({
        success: false,
        message: "Inning is already completed",
      });
    }

    const match = inning.match;

    // Validate match status
    if (match.status !== "inning1" && match.status !== "inning2") {
      return res.status(400).json({
        success: false,
        message: `Cannot complete inning. Match status is '${match.status}'`,
      });
    }

    // Check if all wickets have fallen (10 wickets) or overs completed
    const balls = await Ball.find({ inning: inningId });
    const totalWickets = balls.reduce((sum, ball) => sum + (ball.wicket.isWicket ? 1 : 0), 0);
    
    if (totalWickets < 10) {
      // Check if all overs are bowled (for T20, it's usually 20 overs)
      const tournament = await Match.findById(match._id).populate("tournament");
      const maxOvers = tournament.tournament?.oversPerInnings || 20;
      
      const legalBalls = balls.filter(ball => ball.isLegal).length;
      const oversBowled = Math.floor(legalBalls / 6);
      
      if (oversBowled < maxOvers) {
        // Inning can be completed early (e.g., if chasing team reached target)
        const totalRuns = balls.reduce((sum, ball) => sum + ball.runs.total, 0);
        
        // For second inning, check if target is reached
        if (inning.inningNumber === 2 && inning.target) {
          if (totalRuns < inning.target) {
            return res.status(400).json({
              success: false,
              message: `Cannot complete inning. Batting team needs ${inning.target - totalRuns} more runs to win`,
            });
          }
        }
      }
    }

    // Mark inning as completed
    inning.isCompleted = true;
    await inning.save();

    // If this is the first inning, update match status to allow second inning
    if (inning.inningNumber === 1) {
      // Match status remains inning1 until second inning starts
      // This allows scorer to prepare for second inning
    } 
    // If this is the second inning, match should be completed automatically
    else if (inning.inningNumber === 2) {
      match.status = "completed";
      await match.save();
      
      // Calculate result
      const inning1 = await Inning.findOne({ match: match._id, inningNumber: 1 });
      const inning1Balls = await Ball.find({ inning: inning1._id });
      const inning1Total = inning1Balls.reduce((sum, ball) => sum + ball.runs.total, 0);
      
      const inning2Balls = await Ball.find({ inning: inningId });
      const inning2Total = inning2Balls.reduce((sum, ball) => sum + ball.runs.total, 0);
      
      let result = {};
      if (inning2Total > inning1Total) {
        result.winner = inning.battingTeam._id;
        result.margin = `${inning2Total - inning1Total} runs`;
        result.summary = `${inning.battingTeam.name} won by ${inning2Total - inning1Total} runs`;
      } else if (inning2Total < inning1Total) {
        result.winner = inning.bowlingTeam._id;
        const wicketsLeft = 10 - totalWickets;
        result.margin = `${wicketsLeft} wickets`;
        result.summary = `${inning.bowlingTeam.name} won by ${wicketsLeft} wickets`;
      } else {
        result.summary = "Match tied";
      }
      
      // Update match result if not already set
      if (!match.result || !match.result.winner) {
        match.result = result;
        await match.save();
      }
    }

    res.json({
      success: true,
      message: `Inning ${inning.inningNumber} completed successfully`,
      data: {
        inning,
        matchStatus: match.status,
        nextAction: inning.inningNumber === 1 ? 
          "Start second inning" : 
          "Match completed",
      },
    });
  } catch (error) {
    console.error("Complete inning error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete inning",
      error: error.message,
    });
  }
};

// Get inning details with ball-by-ball data
exports.getInningDetails = async (req, res) => {
  try {
    const { id: inningId } = req.params;
    const { withBalls = false } = req.query;

    // Find inning
    const inning = await Inning.findById(inningId)
      .populate([
        { path: "match", select: "matchNumber venue date type status" },
        { path: "battingTeam", select: "name shortName logo" },
        { path: "bowlingTeam", select: "name shortName logo" },
      ]);

    if (!inning) {
      return res.status(404).json({
        success: false,
        message: "Inning not found",
      });
    }

    // Get match to access playing XI
    const match = await Match.findById(inning.match._id)
      .populate([
        {
          path: `playingXI.${inning.battingTeam._id.toString() === inning.match.team1.toString() ? 'team1' : 'team2'}.player`,
          select: "name jerseyNumber role",
        },
        {
          path: `playingXI.${inning.bowlingTeam._id.toString() === inning.match.team1.toString() ? 'team1' : 'team2'}.player`,
          select: "name jerseyNumber role",
        },
      ]);

    // Get ball-by-ball data if requested
    let balls = [];
    if (withBalls) {
      balls = await Ball.find({ inning: inningId })
        .populate([
          { path: "bowler", select: "name jerseyNumber" },
          { path: "batsman", select: "name jerseyNumber" },
          { path: "nonStriker", select: "name jerseyNumber" },
          { path: "wicket.playerOut", select: "name jerseyNumber" },
          { path: "wicket.fielder", select: "name jerseyNumber" },
        ])
        .sort({ over: 1, ballInOver: 1 });
    }

    // Calculate inning statistics
    const allBalls = await Ball.find({ inning: inningId });
    
    const totalRuns = allBalls.reduce((sum, ball) => sum + ball.runs.total, 0);
    const totalWickets = allBalls.reduce((sum, ball) => sum + (ball.wicket.isWicket ? 1 : 0), 0);
    
    const legalBalls = allBalls.filter(ball => ball.isLegal).length;
    const overs = Math.floor(legalBalls / 6);
    const ballsInCurrentOver = legalBalls % 6;
    
    const extras = allBalls.reduce((sum, ball) => sum + ball.runs.extras, 0);
    const boundaries = {
      fours: allBalls.filter(ball => ball.runs.batsman === 4).length,
      sixes: allBalls.filter(ball => ball.runs.batsman === 6).length,
    };

    // Get batting team players from playing XI
    const battingTeamKey = inning.battingTeam._id.toString() === match.team1.toString() ? 'team1' : 'team2';
    const battingTeamPlayers = match.playingXI?.[battingTeamKey] || [];

    res.json({
      success: true,
      data: {
        inning,
        statistics: {
          totalRuns,
          totalWickets,
          overs: `${overs}.${ballsInCurrentOver}`,
          runRate: overs > 0 ? (totalRuns / overs).toFixed(2) : 0,
          extras,
          boundaries,
        },
        battingTeamPlayers: battingTeamPlayers.map(player => ({
          player: player.player,
          isCaptain: player.isCaptain,
          isWicketKeeper: player.isWicketKeeper,
          battingOrder: player.battingOrder,
        })),
        balls: withBalls ? balls : undefined,
      },
    });
  } catch (error) {
    console.error("Get inning details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch inning details",
      error: error.message,
    });
  }
};

// Get current inning for a match
exports.getCurrentInning = async (req, res) => {
  try {
    const { id: matchId } = req.params;

    // Find match
    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Determine current inning based on match status
    let currentInning = null;
    
    if (match.status === "inning1") {
      currentInning = await Inning.findOne({ 
        match: matchId, 
        inningNumber: 1 
      });
    } else if (match.status === "inning2") {
      currentInning = await Inning.findOne({ 
        match: matchId, 
        inningNumber: 2 
      });
    }

    if (!currentInning) {
      return res.status(404).json({
        success: false,
        message: "No active inning found",
      });
    }

    // Populate inning details
    await currentInning.populate([
      { path: "battingTeam", select: "name shortName logo" },
      { path: "bowlingTeam", select: "name shortName logo" },
    ]);

    // Get inning statistics
    const balls = await Ball.find({ inning: currentInning._id });
    
    const totalRuns = balls.reduce((sum, ball) => sum + ball.runs.total, 0);
    const totalWickets = balls.reduce((sum, ball) => sum + (ball.wicket.isWicket ? 1 : 0), 0);
    
    const legalBalls = balls.filter(ball => ball.isLegal).length;
    const overs = Math.floor(legalBalls / 6);
    const ballsInCurrentOver = legalBalls % 6;

    res.json({
      success: true,
      data: {
        inning: currentInning,
        matchStatus: match.status,
        score: {
          runs: totalRuns,
          wickets: totalWickets,
          overs: `${overs}.${ballsInCurrentOver}`,
          required: currentInning.target ? currentInning.target - totalRuns : null,
        },
      },
    });
  } catch (error) {
    console.error("Get current inning error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch current inning",
      error: error.message,
    });
  }
};