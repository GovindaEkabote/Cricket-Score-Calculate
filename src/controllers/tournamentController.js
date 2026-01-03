// controllers/tournamentController.js
const Tournament = require("../models/Tournament");

// Create Tournament (Admin only)
exports.createTournament = async (req, res) => {
  try {
    const { name, season, startDate, endDate, oversPerInnings } = req.body;

    // Check if tournament already exists
    const existingTournament = await Tournament.findOne({
      name,
      season,
    });

    if (existingTournament) {
      return res.status(400).json({
        success: false,
        message: `Tournament '${name}' for season ${season} already exists`,
      });
    }

    // Create tournament
    const tournament = await Tournament.create({
      name,
      season,
      startDate,
      endDate,
      oversPerInnings: oversPerInnings || 20,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: "Tournament created successfully",
      data: tournament,
    });
  } catch (error) {
    console.error("Create tournament error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create tournament",
      error: error.message,
    });
  }
};

// Get All Tournaments
exports.getAllTournaments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      season,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
    } = req.query;

    // Build query
    const query = {};

    // Filter by status
    if (status && ["upcoming", "ongoing", "completed"].includes(status)) {
      query.status = status;
    }

    // Filter by season
    if (season) {
      query.season = parseInt(season);
    }

    // Search by name
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Execute query
    const tournaments = await Tournament.find(query)
      .populate("createdBy", "username email")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Tournament.countDocuments(query);

    res.json({
      success: true,
      data: tournaments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get tournaments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tournaments",
      error: error.message,
    });
  }
};

// Get Single Tournament
exports.getTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate("createdBy", "username email");

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    res.json({
      success: true,
      data: tournament,
    });
  } catch (error) {
    console.error("Get tournament error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to fetch tournament",
      error: error.message,
    });
  }
};

// Update Tournament
exports.updateTournament = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if tournament exists
    const tournament = await Tournament.findById(id);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check for name/season uniqueness if updating
    if (updates.name || updates.season) {
      const name = updates.name || tournament.name;
      const season = updates.season || tournament.season;

      const existing = await Tournament.findOne({
        name,
        season,
        _id: { $ne: id },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Tournament '${name}' for season ${season} already exists`,
        });
      }
    }

    // Update tournament
    const updatedTournament = await Tournament.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate("createdBy", "username email");

    res.json({
      success: true,
      message: "Tournament updated successfully",
      data: updatedTournament,
    });
  } catch (error) {
    console.error("Update tournament error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to update tournament",
      error: error.message,
    });
  }
};

// Delete Tournament (Soft Delete - Admin only)
exports.deleteTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    // Check if tournament has associated data
    // You might want to check for teams/matches before deleting
    const Team = require("../models/Team");
    const Match = require("../models/Match");
    
    const teamsCount = await Team.countDocuments({ tournament: tournament._id });
    const matchesCount = await Match.countDocuments({ tournament: tournament._id });

    if (teamsCount > 0 || matchesCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete tournament with associated teams or matches",
        data: {
          teamsCount,
          matchesCount
        }
      });
    }

    // Hard delete (or soft delete if you add isDeleted field)
    await Tournament.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Tournament deleted successfully",
    });
  } catch (error) {
    console.error("Delete tournament error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete tournament",
      error: error.message,
    });
  }
};

// Get Tournament Statistics
exports.getTournamentStats = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    const Team = require("../models/Team");
    const Match = require("../models/Match");

    const [teamsCount, completedMatches, ongoingMatches, upcomingMatches] = await Promise.all([
      Team.countDocuments({ tournament: tournament._id }),
      Match.countDocuments({ tournament: tournament._id, status: "completed" }),
      Match.countDocuments({ tournament: tournament._id, status: "ongoing" }),
      Match.countDocuments({ tournament: tournament._id, status: "upcoming" })
    ]);

    const stats = {
      teams: teamsCount,
      matches: {
        total: completedMatches + ongoingMatches + upcomingMatches,
        completed: completedMatches,
        ongoing: ongoingMatches,
        upcoming: upcomingMatches,
      },
      status: tournament.status,
      duration: {
        start: tournament.startDate,
        end: tournament.endDate,
      },
      format: `${tournament.oversPerInnings} overs per innings`,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get tournament stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tournament statistics",
      error: error.message,
    });
  }
};