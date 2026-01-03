# 🏏 Cricket Tournament Management System (IPL-Like Backend)

- A production-grade backend system for managing cricket tournaments (IPL style) with ball-by-ball scoring, real cricket rules, role-based access, and derived statistics.

1. This is not a CRUD demo.
2. This is a rule-driven sports engine.

# 🚨 Design Rules (NON-NEGOTIABLE)

1. Ball is the single source of truth
2. Scores, overs, stats, NRR are derived
3. Strict match state transitions
4. MongoDB transactions for scoring
5. No manual stat manipulation
6. Breaking these rules will corrupt match data.

# 🛠 Tech Stack
1. Node.js
2. Express.js
3. MongoDB + Mongoose
4. JWT Authentication
5. MongoDB Transactions

# REST APIs

👥 User Roles
Role	Access
admin	Full system control
scorer	Live scoring & match operations
viewer	Read-only

# 🧠 Domain Model
User
 └── Tournament
      ├── Team
      │    └── Player
      └── Match
           └── Inning
                └── Ball   (SOURCE OF TRUTH)
                     └── MatchPlayerStats (DERIVED)
                          └── PointsTable (DERIVED)

# 📂 Project Structure
src/
├── config/
├── models/
│   ├── User.js
│   ├── Tournament.js
│   ├── Team.js
│   ├── Player.js
│   ├── Match.js
│   ├── Inning.js
│   ├── Ball.js
│   ├── MatchPlayerStats.js
│   └── PointsTable.js
│
├── controllers/
├── routes/
├── services/
├── middlewares/
├── utils/
├── app.js
└── server.js

# 🔐 Authentication
1. Register
2. POST /auth/register

3. Login
4. POST /auth/login

5. Authorization Header
6. Authorization: Bearer <JWT_TOKEN>

# 🔄 API CREATION ORDER (MANDATORY)

1. Auth / Users
2. Tournament
3. Teams
4. Players
5. Match (metadata only)
6. Toss & Playing XI
7. Inning
8. Ball-by-Ball Scoring
9. Match Completion
10. Points Table (read-only)
11. Skipping this order guarantees bugs.

# 🏆 Tournament APIs
1. POST   /tournaments
2. GET    /tournaments
3. GET    /tournaments/:id
4. PATCH  /tournaments/:id

# Rules:
1. name + season must be unique
2. Only admin can create/update

# 👕 Team APIs
1. POST   /tournaments/:id/teams
2. GET    /tournaments/:id/teams
3. PATCH  /teams/:id

# Rules:
1. Team belongs to one tournament
2. Team name unique per tournament

# 🧑 Player APIs
1. POST   /teams/:id/players
2. GET    /teams/:id/players
3. PATCH  /players/:id
4. DELETE /players/:id

# Rules:
1. Jersey number unique per team
2. Player deletion blocked after match start

# 🏏 Match APIs (Skeleton Only)
1. POST   /tournaments/:id/matches
2. GET    /tournaments/:id/matches
3. GET    /matches/:id
4. PATCH  /matches/:id/status
5. No scoring at this stage.

# 🎯 Toss & Playing XI
1. POST /matches/:id/toss
2. POST /matches/:id/playing-xi


# Rules:
1. Toss allowed once
2. Exactly 11 players
3. Players must belong to the team

# 🔁 Inning APIs
1. POST /matches/:id/innings/start
2. GET  /matches/:id/innings
3. POST /innings/:id/complete

# Rules:
1. Max 2 innings (excluding super overs)
2. Target auto-calculated

# ⚾ Ball-by-Ball Scoring (CRITICAL)
1. POST /innings/:id/balls
2. GET  /innings/:id/balls


# Each ball triggers:
1. Legal delivery validation
2. Over tracking
3. Strike rotation
4. Wicket handling
5. MatchPlayerStats update

# ⚠️ Must run inside MongoDB transactions.

# 🏁 Match Completion
1. POST /matches/:id/complete


# Actions:

1. Decide winner
2. Set margin
3. Update points table
4. Lock match & innings

# 📊 Points Table
1. GET /tournaments/:id/points-table

# Rules:
1. Read-only
2. Auto-updated
3. NRR derived from match data

# 🚫 Forbidden Operations
1. Manual score edits
2. Manual points table updates
3. Direct player stat updates
4. Editing completed matches
5. Skipping innings
6. These restrictions are intentional.

# 🧪 Data Integrity
1. MongoDB indexes enforce uniqueness
2. Transactions guarantee atomic updates
3. Derived data prevents inconsistency
4. Match state machine blocks invalid actions

# ⚙️ Setup
1. git clone <repo-url>
2. cd cricket-backend
3. npm install
4. npm run dev

# Environment Variables
1. PORT=5000
2. MONGO_URI=mongodb://localhost:27017/cricket
3. JWT_SECRET=your_secret_key

# 📈 Scalability
1. Designed for:
2. IPL-scale tournaments
3. High-frequency scoring
4. Concurrent viewers
5. Extendable to:
6. Super Overs
7. DLS Method
8. Impact Player Rule
9. WebSocket Live Scores

# 🧠 Final Note
1. This system is rule-driven, not CRUD-driven.

- If you:
1. store derived data manually
2. bypass match state checks
3. update stats directly
4. You are doing it wrong.