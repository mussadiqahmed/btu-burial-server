const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Rate Limiter for Admin Endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP
});
app.use("/api/admin", adminLimiter);

// Rate Limiter for Form Submissions
const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 submissions per IP
  message: "Submission limit exceeded. Please try again after 1 hour.",
});
app.use("/api/membership/join", formLimiter);
app.use("/api/funeral-notice", formLimiter);
app.use("/api/contact", formLimiter);
app.use("/api/survey", formLimiter);
app.use("/api/election-reg", formLimiter);

// Input Sanitization
function sanitizeInput(input) {
  if (typeof input === "string") {
    return input.replace(/[<>'";]/g, "");
  }
  return input;
}

function sanitizeObject(obj) {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeInput(value);
  }
  return sanitized;
}

// Initialize DB
(async function initializeDB() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MySQL Connected");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fullName VARCHAR(255) NOT NULL,
        contactNumber VARCHAR(15) NOT NULL,
        idNumber VARCHAR(50) NOT NULL,
        schoolName VARCHAR(255) NOT NULL,
        officeContact VARCHAR(15) NOT NULL,
        read_status ENUM('unread', 'read') DEFAULT 'unread',
        admin_reply TEXT,
        status ENUM('pending', 'done') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS funeral_notices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        yourName VARCHAR(255) NOT NULL,
        idNumber VARCHAR(50) NOT NULL,
        deceasedName VARCHAR(255) NOT NULL,
        dependentName VARCHAR(255),
        read_status ENUM('unread', 'read') DEFAULT 'unread',
        admin_reply TEXT,
        status ENUM('pending', 'done') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contactNumber VARCHAR(15) NOT NULL,
        message TEXT NOT NULL,
        read_status ENUM('unread', 'read') DEFAULT 'unread',
        admin_reply TEXT,
        status ENUM('pending', 'done') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS survey_responses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        satisfaction VARCHAR(50) NOT NULL,
        addressed VARCHAR(50) NOT NULL,
        responseTime VARCHAR(50) NOT NULL,
        courtesy VARCHAR(50) NOT NULL,
        helpful VARCHAR(50) NOT NULL,
        expectations VARCHAR(50) NOT NULL,
        suggestions TEXT,
        recommend VARCHAR(50) NOT NULL,
        difficulties TEXT,
        overall VARCHAR(50) NOT NULL,
        read_status ENUM('unread', 'read') DEFAULT 'unread',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS election_registrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fullName VARCHAR(255) NOT NULL,
        idNumber VARCHAR(50) NOT NULL,
        contactNumber VARCHAR(15) NOT NULL,
        uniqueId VARCHAR(9) NOT NULL,
        read_status ENUM('unread', 'read') DEFAULT 'unread',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS news (
        id INT AUTO_INCREMENT PRIMARY KEY,
        text TEXT,
        image_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ Database initialized");
    connection.release();
  } catch (err) {
    console.error("❌ Database initialization failed:", err.message);
    process.exit(1);
  }
})();

// Admin Login Endpoint
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = sanitizeObject(req.body);
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM admin_users WHERE username = ?", [username]);
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({ message: "Login successful", user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Health Check
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "Server running", mysql: "Connected" });
  } catch (err) {
    res.status(500).json({
      status: "Server running",
      mysql: "Disconnected",
      error: err.message,
    });
  }
});

// Dashboard Stats
app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const [members] = await pool.query(
      'SELECT COUNT(*) as total, SUM(read_status = "unread") as unread FROM members'
    );
    const [funeralNotices] = await pool.query(
      'SELECT COUNT(*) as total, SUM(read_status = "unread") as unread FROM funeral_notices'
    );
    const [contactMessages] = await pool.query(
      'SELECT COUNT(*) as total, SUM(read_status = "unread") as unread FROM contact_messages'
    );
    const [surveyResponses] = await pool.query(
      'SELECT COUNT(*) as total, SUM(read_status = "unread") as unread FROM survey_responses'
    );
    const [electionRegistrations] = await pool.query(
      'SELECT COUNT(*) as total, SUM(read_status = "unread") as unread FROM election_registrations'
    );
    const [recent] = await pool.query(`
      (SELECT "members" as type, id, fullName as title, created_at FROM members ORDER BY created_at DESC LIMIT 5)
      UNION
      (SELECT "funeral_notices" as type, id, deceasedName as title, created_at FROM funeral_notices ORDER BY created_at DESC LIMIT 5)
      UNION
      (SELECT "contact_messages" as type, id, name as title, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 5)
      ORDER BY created_at DESC LIMIT 5
    `);

    res.json({
      stats: {
        members: members[0],
        funeralNotices: funeralNotices[0],
        contactMessages: contactMessages[0],
        surveyResponses: surveyResponses[0],
        electionRegistrations: electionRegistrations[0],
      },
      recent,
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err.message);
    res.status(500).json({
      message: "Error fetching dashboard stats",
      error: err.message,
    });
  }
});

// Response Endpoints
const responseEndpoints = [
  {
    name: "members",
    table: "members",
    fields: [
      "fullName",
      "contactNumber",
      "idNumber",
      "schoolName",
      "officeContact",
      "read_status",
      "admin_reply",
      "status",
      "created_at",
    ],
  },
  {
    name: "funeral_notices",
    table: "funeral_notices",
    fields: [
      "yourName",
      "idNumber",
      "deceasedName",
      "dependentName",
      "read_status",
      "admin_reply",
      "status",
      "created_at",
    ],
  },
  {
    name: "contact_messages",
    table: "contact_messages",
    fields: [
      "name",
      "contactNumber",
      "message",
      "read_status",
      "admin_reply",
      "status",
      "created_at",
    ],
  },
  {
    name: "survey_responses",
    table: "survey_responses",
    fields: [
      "satisfaction",
      "addressed",
      "responseTime",
      "courtesy",
      "helpful",
      "expectations",
      "suggestions",
      "recommend",
      "difficulties",
      "overall",
      "read_status",
      "created_at",
    ],
  },
  {
    name: "election_registrations",
    table: "election_registrations",
    fields: [
      "fullName",
      "idNumber",
      "contactNumber",
      "uniqueId",
      "read_status",
      "created_at",
    ],
  },
];

responseEndpoints.forEach(({ name, table, fields }) => {
  // Get Responses
  app.get(`/api/admin/${name}`, async (req, res) => {
    const { status = "all", page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = status === "all" ? "" : `WHERE read_status = ?`;
    const params =
      status === "all" ? [parseInt(limit), offset] : [status, parseInt(limit), offset];

    try {
      const [rows] = await pool.query(
        `SELECT ${fields.join(", ")}, id FROM ${table} ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        params
      );
      const [countResult] = await pool.query(
        `SELECT COUNT(*) as total, SUM(read_status = "unread") as unread FROM ${table}`
      );
      res.json({
        data: rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
          totalItems: countResult[0].total,
          unread: countResult[0].unread,
        },
      });
    } catch (err) {
      console.error(`Error fetching ${name}:`, err.message);
      res.status(500).json({
        message: `Error fetching ${name}`,
        error: err.message,
      });
    }
  });

  // Update Read Status
  app.patch(`/api/admin/${name}/:id/read`, async (req, res) => {
    const { id } = req.params;
    const { read_status } = req.body;
    if (!["read", "unread"].includes(read_status)) {
      return res.status(400).json({ message: "Invalid read_status" });
    }

    try {
      const [result] = await pool.query(
        `UPDATE ${table} SET read_status = ? WHERE id = ?`,
        [read_status, id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: `Record not found in ${table}` });
      }
      console.log(`Updated read_status for ${table} id=${id} to ${read_status}`);
      res.json({ message: "Read status updated" });
    } catch (err) {
      console.error(`Error updating read_status for ${table} id=${id}:`, err.message);
      res.status(500).json({
        message: "Error updating read status",
        error: err.message,
      });
    }
  });

  // Delete Response
  app.delete(`/api/admin/${name}/:id`, async (req, res) => {
    const { id } = req.params;
    try {
      const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: `Record not found in ${table}` });
      }
      console.log(`Deleted record from ${table} id=${id}`);
      res.json({ message: "Response deleted" });
    } catch (err) {
      console.error(`Error deleting from ${table} id=${id}:`, err.message);
      res.status(500).json({
        message: "Error deleting response",
        error: err.message,
      });
    }
  });

  // Update Reply and Status (for members, funeral_notices, contact_messages)
  if (["members", "funeral_notices", "contact_messages"].includes(name)) {
    app.patch(`/api/admin/${name}/:id/reply`, async (req, res) => {
      const { id } = req.params;
      const { admin_reply, status } = sanitizeObject(req.body);
      if (!status || !["pending", "done"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      try {
        const [result] = await pool.query(
          `UPDATE ${table} SET admin_reply = ?, status = ?, read_status = 'read' WHERE id = ?`,
          [admin_reply || null, status, id]
        );
        if (result.affectedRows === 0) {
          return res.status(404).json({ message: `Record not found in ${table}` });
        }
        console.log(`Updated reply and status for ${table} id=${id}`);
        res.json({ message: "Reply and status updated" });
      } catch (err) {
        console.error(`Error updating reply for ${table} id=${id}:`, err.message);
        res.status(500).json({
          message: "Error updating reply",
          error: err.message,
        });
      }
    });
  }
});

// Survey Analysis
app.get("/api/admin/survey_analysis", async (req, res) => {
  try {
    const [satisfaction] = await pool.query(`
      SELECT satisfaction, COUNT(*) as count 
      FROM survey_responses 
      GROUP BY satisfaction
    `);
    const [recommend] = await pool.query(`
      SELECT recommend, COUNT(*) as count 
      FROM survey_responses 
      GROUP BY recommend
    `);
    res.json({ satisfaction, recommend });
  } catch (err) {
    console.error("Error fetching survey analysis:", err.message);
    res.status(500).json({
      message: "Error fetching survey analysis",
      error: err.message,
    });
  }
});

// Form Submission Endpoints
app.post("/api/membership/join", async (req, res) => {
  const { fullName, contactNumber, id, schoolName, officeContact } =
    sanitizeObject(req.body);
  if (!fullName || !contactNumber || !id || !schoolName || !officeContact) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    await pool.query(
      "INSERT INTO members (fullName, contactNumber, idNumber, schoolName, officeContact) VALUES (?, ?, ?, ?, ?)",
      [fullName, contactNumber, id, schoolName, officeContact]
    );
    res.json({
      message: "Thank you for joining BTU Burial. We will contact you within 48 hours.",
    });
  } catch (err) {
    console.error("Error inserting member:", err.message);
    res.status(500).json({ message: "Database error", error: err.message });
  }
});

app.post("/api/funeral-notice", async (req, res) => {
  const { yourName, id, deceasedName, dependentName } = sanitizeObject(req.body);
  if (!yourName || !id || !deceasedName) {
    return res.status(400).json({ message: "Required fields are missing" });
  }

  try {
    await pool.query(
      "INSERT INTO funeral_notices (yourName, idNumber, deceasedName, dependentName) VALUES (?, ?, ?, ?)",
      [yourName, id, deceasedName, dependentName || null]
    );
    res.json({
      message:
        "Thank you for submitting the funeral notice. We will contact you within 24 hours.",
    });
  } catch (err) {
    console.error("Error inserting funeral notice:", err.message);
    res.status(500).json({ message: "Database error", error: err.message });
  }
});

app.post("/api/contact", async (req, res) => {
  const { name, contactNumber, message } = sanitizeObject(req.body);
  if (!name || !contactNumber || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    await pool.query(
      "INSERT INTO contact_messages (name, contactNumber, message) VALUES (?, ?, ?)",
      [name, contactNumber, message]
    );
    res.json({
      message: "Thank you for your message. We will contact you within 24 hours.",
    });
  } catch (err) {
    console.error("Error inserting contact message:", err.message);
    res.status(500).json({ message: "Database error", error: err.message });
  }
});

app.post("/api/survey", async (req, res) => {
  const {
    satisfaction,
    addressed,
    responseTime,
    courtesy,
    helpful,
    expectations,
    suggestions,
    recommend,
    difficulties,
    overall,
  } = sanitizeObject(req.body);
  if (
    !satisfaction ||
    !addressed ||
    !responseTime ||
    !courtesy ||
    !helpful ||
    !expectations ||
    !recommend ||
    !overall
  ) {
    return res.status(400).json({ message: "Required fields are missing" });
  }

  try {
    await pool.query(
      `INSERT INTO survey_responses 
      (satisfaction, addressed, responseTime, courtesy, helpful, expectations, suggestions, recommend, difficulties, overall) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        satisfaction,
        addressed,
        responseTime,
        courtesy,
        helpful,
        expectations,
        suggestions || null,
        recommend,
        difficulties || null,
        overall,
      ]
    );
    res.json({ message: "Thank you for your feedback." });
  } catch (err) {
    console.error("Error inserting survey response:", err.message);
    res.status(500).json({ message: "Database error", error: err.message });
  }
});

app.post("/api/election-reg", async (req, res) => {
  const { fullName, id, contactNumber } = sanitizeObject(req.body);
  if (!fullName || !id || !contactNumber) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const uniqueId = Math.random().toString(36).substr(2, 9).toUpperCase();
    await pool.query(
      "INSERT INTO election_registrations (fullName, idNumber, contactNumber, uniqueId) VALUES (?, ?, ?, ?)",
      [fullName, id, contactNumber, uniqueId]
    );
    res.json({ message: "Election registration completed.", uniqueId });
  } catch (err) {
    console.error("Error inserting election registration:", err.message);
    res.status(500).json({ message: "Database error", error: err.message });
  }
});

// News Endpoint with Pagination
app.get("/api/news", async (req, res) => {
  console.log("Received /api/news request");
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    const [countResult] = await pool.query("SELECT COUNT(*) as total FROM news");
    const totalItems = countResult[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    console.log(
      `News fetched: ${rows.length} items, page ${page}, total pages ${totalPages}`
    );
    res.json({
      news: rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
      },
    });
  } catch (err) {
    console.error("Error fetching news:", err.message);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
