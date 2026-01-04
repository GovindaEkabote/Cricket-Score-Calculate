// server.js or app.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const authRoutes = require("./src/routes/auth");
const tournamentRoutes = require("./src/routes/tournament");
const teamRoutes  = require("./src/routes/team");
const playerRoutes = require("./src/routes/players");
const matchRoutes  = require("./src/routes/match");
const tossRoutes   = require("./src/routes/toss");
const inningRoutes    = require("./src/routes/inning");
const ballRoutes     = require("./src/routes/ball");
const matchCompletionRoutes      = require("./src/routes/matchCompletion");

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true // Allow cookies to be sent
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Add cookie parser middleware

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/cricket-scorer", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Routes
app.use("/auth", authRoutes);
app.use("/tournaments", tournamentRoutes);
app.use("/api", teamRoutes); 
app.use("/api", playerRoutes); 
app.use("/api", matchRoutes); 
app.use("/api", tossRoutes);
app.use("/api", inningRoutes);
app.use("/api", ballRoutes);
app.use("/api", matchCompletionRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({ message: "Cricket Scorer API" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});