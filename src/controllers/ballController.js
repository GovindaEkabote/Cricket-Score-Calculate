// controllers/ballController.js
const mongoose = require("mongoose");
const Ball = require("../models/Ball");
const Inning = require("../models/Inning");
const Match = require("../models/Match");
const MatchPlayerStats = require("../models/MatchPlayerStats");
const Player = require("../models/Player");

// Record a ball with transaction
exports.recordBall = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { inningId } = req.params;
    const {
      over,
      ballInOver,
      isLegal = true,
      bowler,
      batsman,
      nonStriker,
      runs = { batsman: 0, extras: 0, total: 0 },
      extraType,
      wicket = { isWicket: false },
      commentary
    } = req.body;

    // Validate required fields
    if (!over || !ballInOver || !bowler || !batsman || !nonStriker) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "over, ballInOver, bowler, batsman, and nonStriker are required"
      });
    }

    // Validate ball number
    if (ballInOver < 1 || ballInOver > 6) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "ballInOver must be between 1 and 6"
      });
    }

    // Validate runs
    if (!runs.total && runs.total !== 0) {
      runs.total = (runs.batsman || 0) + (runs.extras || 0);
    }

    // Find inning
    const inning = await Inning.findById(inningId).session(session);
    if (!inning) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Inning not found"
      });
    }

    // Check if inning is completed
    if (inning.isCompleted) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Cannot record ball. Inning is completed"
      });
    }

    // Find match
    const match = await Match.findById(inning.match).session(session);
    if (!match) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Match not found"
      });
    }

    // Validate players belong to correct teams
    const [bowlerPlayer, batsmanPlayer, nonStrikerPlayer] = await Promise.all([
      Player.findById(bowler).session(session),
      Player.findById(batsman).session(session),
      Player.findById(nonStriker).session(session)
    ]);

    if (!bowlerPlayer || !batsmanPlayer || !nonStrikerPlayer) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "One or more players not found"
      });
    }

    // Check bowler belongs to bowling team
    if (bowlerPlayer.team.toString() !== inning.bowlingTeam.toString()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Bowler must be from the bowling team"
      });
    }

    // Check batsmen belong to batting team
    if (batsmanPlayer.team.toString() !== inning.battingTeam.toString() ||
        nonStrikerPlayer.team.toString() !== inning.battingTeam.toString()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Batsmen must be from the batting team"
      });
    }

    // Check if this ball already exists
    const existingBall = await Ball.findOne({
      inning: inningId,
      over,
      ballInOver
    }).session(session);

    if (existingBall) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Ball already exists for over ${over}.${ballInOver}`
      });
    }

    // For legal balls, ensure previous balls exist
    if (isLegal) {
      if (ballInOver > 1) {
        const prevBall = await Ball.findOne({
          inning: inningId,
          over,
          ballInOver: ballInOver - 1
        }).session(session);

        if (!prevBall) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Previous ball ${over}.${ballInOver - 1} must be recorded first`
          });
        }
      }
    }

    // Check for wicket consistency
    if (wicket.isWicket) {
      if (!wicket.type) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Wicket type is required when isWicket is true"
        });
      }

      if (!wicket.playerOut) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "playerOut is required for a wicket"
        });
      }

      // Validate playerOut is current batsman
      if (wicket.playerOut.toString() !== batsman.toString()) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Wicket can only be of the current batsman"
        });
      }

      // For caught/run-out/stumped, validate fielder
      if (['caught', 'run-out', 'stumped'].includes(wicket.type) && !wicket.fielder) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `fielder is required for ${wicket.type} dismissal`
        });
      }
    }

    // Create ball
    const ball = await Ball.create([{
      match: inning.match,
      inning: inningId,
      over,
      ballInOver,
      isLegal,
      bowler,
      batsman,
      nonStriker,
      runs,
      extraType,
      wicket,
      commentary
    }], { session });

    // Update player stats using transaction
    await this.updatePlayerStats(inning, ball[0], session);

    // Check for inning completion
    await this.checkInningCompletion(inning, session);

    // Commit transaction
    await session.commitTransaction();

    // Populate ball data for response
    const populatedBall = await Ball.findById(ball[0]._id)
      .populate([
        { path: 'bowler', select: 'name jerseyNumber' },
        { path: 'batsman', select: 'name jerseyNumber' },
        { path: 'nonStriker', select: 'name jerseyNumber' },
        { path: 'wicket.playerOut', select: 'name jerseyNumber' },
        { path: 'wicket.fielder', select: 'name jerseyNumber' }
      ]);

    res.status(201).json({
      success: true,
      message: "Ball recorded successfully",
      data: populatedBall
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Record ball error:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Ball already exists for this position"
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to record ball",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Update player stats for a ball
updatePlayerStats = async (inning, ball, session) => {
  // Update batsman stats
  const batsmanStats = await MatchPlayerStats.findOneAndUpdate(
    {
      match: inning.match,
      player: ball.batsman,
      team: inning.battingTeam
    },
    {
      $inc: {
        'batting.runs': ball.runs.batsman,
        'batting.balls': ball.isLegal ? 1 : 0,
        'batting.fours': ball.runs.batsman === 4 ? 1 : 0,
        'batting.sixes': ball.runs.batsman === 6 ? 1 : 0
      },
      $set: {
        'batting.out': ball.wicket.isWicket ? true : { $ifNull: ['$batting.out', false] }
      }
    },
    { upsert: true, new: true, session }
  );

  // Update bowler stats
  if (ball.isLegal) {
    await MatchPlayerStats.findOneAndUpdate(
      {
        match: inning.match,
        player: ball.bowler,
        team: inning.bowlingTeam
      },
      {
        $inc: {
          'bowling.overs': 1/6, // Increment by 1 ball (1/6 of an over)
          'bowling.runsConceded': ball.runs.total,
          'bowling.wickets': ball.wicket.isWicket ? 1 : 0,
          'bowling.maidens': (ball.runs.total === 0 && ball.isLegal) ? 1/6 : 0
        }
      },
      { upsert: true, new: true, session }
    );
  }

  // Update wicket taker stats for caught/run-out/stumped
  if (ball.wicket.isWicket && ball.wicket.fielder && 
      ['caught', 'run-out', 'stumped'].includes(ball.wicket.type)) {
    await MatchPlayerStats.findOneAndUpdate(
      {
        match: inning.match,
        player: ball.wicket.fielder,
        team: inning.bowlingTeam
      },
      { $inc: { 'bowling.wickets': 1 } },
      { upsert: true, new: true, session }
    );
  }
};

// Check inning completion conditions
checkInningCompletion = async (inning, session) => {
  const match = await Match.findById(inning.match).session(session);
  const tournament = await Match.findById(inning.match).populate('tournament').session(session);
  const maxOvers = tournament.tournament?.oversPerInnings || 20;

  // Get all balls for the inning
  const balls = await Ball.find({ inning: inning._id }).session(session);
  
  const totalRuns = balls.reduce((sum, ball) => sum + ball.runs.total, 0);
  const totalWickets = balls.reduce((sum, ball) => sum + (ball.wicket.isWicket ? 1 : 0), 0);
  const legalBalls = balls.filter(ball => ball.isLegal).length;
  const oversBowled = Math.floor(legalBalls / 6);

  // Check completion conditions
  let isInningComplete = false;
  
  if (totalWickets >= 10) {
    isInningComplete = true; // All out
  } else if (oversBowled >= maxOvers) {
    isInningComplete = true; // All overs bowled
  } else if (inning.inningNumber === 2 && inning.target && totalRuns >= inning.target) {
    isInningComplete = true; // Target achieved
  }

  if (isInningComplete && !inning.isCompleted) {
    inning.isCompleted = true;
    await inning.save({ session });

    // If second inning completes, update match status
    if (inning.inningNumber === 2) {
      match.status = 'completed';
      
      // Calculate and set match result
      const firstInning = await Inning.findOne({
        match: inning.match,
        inningNumber: 1
      }).session(session);
      
      const firstInningBalls = await Ball.find({ inning: firstInning._id }).session(session);
      const firstInningTotal = firstInningBalls.reduce((sum, ball) => sum + ball.runs.total, 0);
      
      let result = {};
      if (totalRuns > firstInningTotal) {
        result.winner = inning.battingTeam;
        result.margin = `${totalRuns - firstInningTotal} runs`;
        result.summary = `${inning.battingTeam.name} won by ${totalRuns - firstInningTotal} runs`;
      } else if (totalRuns < firstInningTotal) {
        result.winner = inning.bowlingTeam;
        const wicketsLeft = 10 - totalWickets;
        result.margin = `${wicketsLeft} wickets`;
        result.summary = `${inning.bowlingTeam.name} won by ${wicketsLeft} wickets`;
      } else {
        result.summary = "Match tied";
      }
      
      match.result = result;
      await match.save({ session });
    }
  }
};

// Get balls for an inning
exports.getInningBalls = async (req, res) => {
  try {
    const { inningId } = req.params;
    const { page = 1, limit = 20, sortBy = 'over', sortOrder = 'asc' } = req.query;

    // Validate inning exists
    const inning = await Inning.findById(inningId);
    if (!inning) {
      return res.status(404).json({
        success: false,
        message: "Inning not found"
      });
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalBalls = await Ball.countDocuments({ inning: inningId });

    // Get balls with pagination and population
    const balls = await Ball.find({ inning: inningId })
      .populate([
        { path: 'bowler', select: 'name jerseyNumber' },
        { path: 'batsman', select: 'name jerseyNumber' },
        { path: 'nonStriker', select: 'name jerseyNumber' },
        { path: 'wicket.playerOut', select: 'name jerseyNumber' },
        { path: 'wicket.fielder', select: 'name jerseyNumber' }
      ])
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Group balls by over for easier consumption
    const ballsByOver = {};
    balls.forEach(ball => {
      if (!ballsByOver[ball.over]) {
        ballsByOver[ball.over] = [];
      }
      ballsByOver[ball.over].push(ball);
    });

    // Calculate inning statistics
    const allBalls = await Ball.find({ inning: inningId });
    const totalRuns = allBalls.reduce((sum, ball) => sum + ball.runs.total, 0);
    const totalWickets = allBalls.reduce((sum, ball) => sum + (ball.wicket.isWicket ? 1 : 0), 0);
    const legalBalls = allBalls.filter(ball => ball.isLegal).length;
    const overs = Math.floor(legalBalls / 6);
    const ballsInCurrentOver = legalBalls % 6;

    res.json({
      success: true,
      data: {
        balls,
        groupedByOver: ballsByOver,
        statistics: {
          totalRuns,
          totalWickets,
          overs: `${overs}.${ballsInCurrentOver}`,
          runRate: overs > 0 ? (totalRuns / overs).toFixed(2) : 0,
          extras: allBalls.reduce((sum, ball) => sum + ball.runs.extras, 0)
        }
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalBalls / limit),
        totalBalls,
        hasNextPage: skip + balls.length < totalBalls,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error("Get inning balls error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch balls",
      error: error.message
    });
  }
};

// Get current over summary
exports.getCurrentOver = async (req, res) => {
  try {
    const { inningId } = req.params;

    const inning = await Inning.findById(inningId);
    if (!inning) {
      return res.status(404).json({
        success: false,
        message: "Inning not found"
      });
    }

    // Get the latest over number
    const lastBall = await Ball.findOne({ inning: inningId })
      .sort({ over: -1, ballInOver: -1 })
      .populate('bowler', 'name jerseyNumber');

    if (!lastBall) {
      return res.json({
        success: true,
        data: {
          currentOver: 0,
          currentBall: 0,
          balls: [],
          bowler: null,
          summary: {
            runs: 0,
            wickets: 0,
            extras: 0
          }
        }
      });
    }

    // Get all balls of the current over
    const currentOverBalls = await Ball.find({
      inning: inningId,
      over: lastBall.over
    }).sort({ ballInOver: 1 })
      .populate([
        { path: 'batsman', select: 'name jerseyNumber' },
        { path: 'bowler', select: 'name jerseyNumber' }
      ]);

    // Calculate over statistics
    const overSummary = currentOverBalls.reduce((acc, ball) => ({
      runs: acc.runs + ball.runs.total,
      wickets: acc.wickets + (ball.wicket.isWicket ? 1 : 0),
      extras: acc.extras + ball.runs.extras
    }), { runs: 0, wickets: 0, extras: 0 });

    res.json({
      success: true,
      data: {
        currentOver: lastBall.over,
        currentBall: lastBall.ballInOver,
        balls: currentOverBalls,
        bowler: lastBall.bowler,
        summary: overSummary
      }
    });

  } catch (error) {
    console.error("Get current over error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch current over",
      error: error.message
    });
  }
};

// Get batting partners (current batsmen)
exports.getBattingPartners = async (req, res) => {
  try {
    const { inningId } = req.params;

    const inning = await Inning.findById(inningId);
    if (!inning) {
      return res.status(404).json({
        success: false,
        message: "Inning not found"
      });
    }

    // Get the last ball to identify current batsmen
    const lastBall = await Ball.findOne({ inning: inningId })
      .sort({ over: -1, ballInOver: -1 })
      .populate([
        { path: 'batsman', select: 'name jerseyNumber' },
        { path: 'nonStriker', select: 'name jerseyNumber' }
      ]);

    if (!lastBall) {
      return res.json({
        success: true,
        data: {
          striker: null,
          nonStriker: null,
          partnership: {
            runs: 0,
            balls: 0,
            currentRunRate: 0
          }
        }
      });
    }

    // Calculate partnership since last wicket
    const lastWicketBall = await Ball.findOne({
      inning: inningId,
      'wicket.isWicket': true
    }).sort({ over: -1, ballInOver: -1 });

    let partnershipBalls = [];
    if (lastWicketBall) {
      partnershipBalls = await Ball.find({
        inning: inningId,
        $or: [
          { over: { $gt: lastWicketBall.over } },
          { over: lastWicketBall.over, ballInOver: { $gt: lastWicketBall.ballInOver } }
        ]
      });
    } else {
      partnershipBalls = await Ball.find({ inning: inningId });
    }

    const partnershipRuns = partnershipBalls.reduce((sum, ball) => sum + ball.runs.total, 0);
    const partnershipBallsCount = partnershipBalls.filter(ball => ball.isLegal).length;

    res.json({
      success: true,
      data: {
        striker: lastBall.batsman,
        nonStriker: lastBall.nonStriker,
        partnership: {
          runs: partnershipRuns,
          balls: partnershipBallsCount,
          currentRunRate: partnershipBallsCount > 0 ? 
            (partnershipRuns / partnershipBallsCount * 6).toFixed(2) : 0
        }
      }
    });

  } catch (error) {
    console.error("Get batting partners error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch batting partners",
      error: error.message
    });
  }
};

// Undo last ball (admin/scorer only)
exports.undoLastBall = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { inningId } = req.params;

    // Find the last ball
    const lastBall = await Ball.findOne({ inning: inningId })
      .sort({ over: -1, ballInOver: -1 })
      .session(session);

    if (!lastBall) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "No balls to undo"
      });
    }

    const inning = await Inning.findById(inningId).session(session);
    if (!inning) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Inning not found"
      });
    }

    // Revert player stats
    await this.revertPlayerStats(inning, lastBall, session);

    // Delete the ball
    await Ball.deleteOne({ _id: lastBall._id }).session(session);

    // Check if inning needs to be marked as incomplete
    if (inning.isCompleted) {
      const balls = await Ball.find({ inning: inningId }).session(session);
      const totalWickets = balls.reduce((sum, ball) => sum + (ball.wicket.isWicket ? 1 : 0), 0);
      const legalBalls = balls.filter(ball => ball.isLegal).length;
      const oversBowled = Math.floor(legalBalls / 6);
      
      if (totalWickets < 10 && oversBowled < (inning.match.tournament?.oversPerInnings || 20)) {
        inning.isCompleted = false;
        await inning.save({ session });
      }
    }

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Last ball undone successfully",
      data: {
        undoneBall: lastBall,
        inningStatus: inning.isCompleted ? 'completed' : 'in progress'
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Undo ball error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to undo ball",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Revert player stats when undoing a ball
revertPlayerStats = async (inning, ball, session) => {
  // Revert batsman stats
  await MatchPlayerStats.findOneAndUpdate(
    {
      match: inning.match,
      player: ball.batsman,
      team: inning.battingTeam
    },
    {
      $inc: {
        'batting.runs': -ball.runs.batsman,
        'batting.balls': ball.isLegal ? -1 : 0,
        'batting.fours': ball.runs.batsman === 4 ? -1 : 0,
        'batting.sixes': ball.runs.batsman === 6 ? -1 : 0
      },
      $set: {
        'batting.out': false // Since we're undoing, batsman is not out
      }
    },
    { session }
  );

  // Revert bowler stats
  if (ball.isLegal) {
    await MatchPlayerStats.findOneAndUpdate(
      {
        match: inning.match,
        player: ball.bowler,
        team: inning.bowlingTeam
      },
      {
        $inc: {
          'bowling.overs': -1/6,
          'bowling.runsConceded': -ball.runs.total,
          'bowling.wickets': ball.wicket.isWicket ? -1 : 0,
          'bowling.maidens': (ball.runs.total === 0 && ball.isLegal) ? -1/6 : 0
        }
      },
      { session }
    );
  }

  // Revert fielder stats for catches/run-outs/stumpings
  if (ball.wicket.isWicket && ball.wicket.fielder && 
      ['caught', 'run-out', 'stumped'].includes(ball.wicket.type)) {
    await MatchPlayerStats.findOneAndUpdate(
      {
        match: inning.match,
        player: ball.wicket.fielder,
        team: inning.bowlingTeam
      },
      { $inc: { 'bowling.wickets': -1 } },
      { session }
    );
  }
};

// Get ball-by-ball commentary
exports.getBallCommentary = async (req, res) => {
  try {
    const { inningId } = req.params;
    const { fromOver = 0, toOver = null } = req.query;

    const inning = await Inning.findById(inningId);
    if (!inning) {
      return res.status(404).json({
        success: false,
        message: "Inning not found"
      });
    }

    let query = { inning: inningId, over: { $gte: parseInt(fromOver) } };
    if (toOver) {
      query.over.$lte = parseInt(toOver);
    }

    const balls = await Ball.find(query)
      .sort({ over: 1, ballInOver: 1 })
      .populate([
        { path: 'bowler', select: 'name jerseyNumber' },
        { path: 'batsman', select: 'name jerseyNumber' },
        { path: 'wicket.playerOut', select: 'name jerseyNumber' },
        { path: 'wicket.fielder', select: 'name jerseyNumber' }
      ]);

    // Format commentary
    const commentary = balls.map(ball => ({
      over: ball.over,
      ball: ball.ballInOver,
      bowler: ball.bowler?.name,
      batsman: ball.batsman?.name,
      runs: ball.runs.total,
      extra: ball.extraType,
      wicket: ball.wicket.isWicket ? {
        type: ball.wicket.type,
        playerOut: ball.wicket.playerOut?.name,
        fielder: ball.wicket.fielder?.name
      } : null,
      text: ball.commentary || this.generateCommentary(ball),
      timestamp: ball.createdAt
    }));

    res.json({
      success: true,
      data: commentary
    });

  } catch (error) {
    console.error("Get commentary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch commentary",
      error: error.message
    });
  }
};

// Generate automatic commentary
generateCommentary = (ball) => {
  if (ball.wicket.isWicket) {
    const wicketTypes = {
      'bowled': `Clean bowled! ${ball.wicket.playerOut?.name} is out.`,
      'caught': `Caught! ${ball.wicket.playerOut?.name} is caught by ${ball.wicket.fielder?.name}.`,
      'lbw': `LBW! ${ball.wicket.playerOut?.name} is out leg before wicket.`,
      'run-out': `Run out! ${ball.wicket.playerOut?.name} is run out.`,
      'stumped': `Stumped! ${ball.wicket.playerOut?.name} is stumped.`,
      'hit-wicket': `Hit wicket! ${ball.wicket.playerOut?.name} is out.`
    };
    return wicketTypes[ball.wicket.type] || `${ball.wicket.playerOut?.name} is out.`;
  }

  if (ball.runs.total === 0) {
    return "Dot ball.";
  }

  if (ball.runs.batsman === 4) {
    return "Four runs! Excellent shot.";
  }

  if (ball.runs.batsman === 6) {
    return "Six! Massive hit.";
  }

  if (ball.extraType === 'wide') {
    return "Wide ball.";
  }

  if (ball.extraType === 'no-ball') {
    return "No ball. Free hit coming up.";
  }

  return `${ball.runs.total} run${ball.runs.total > 1 ? 's' : ''}.`;
};