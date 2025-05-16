const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { google } = require('googleapis');
require("dotenv").config();

const app = express();

// Trust proxy - required for rate limiting behind reverse proxy
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

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

// Google Drive API Setup
async function getGoogleAuth() {
  try {
    let credentials = null;

    // First try GOOGLE_CREDENTIALS environment variable
    if (process.env.GOOGLE_CREDENTIALS) {
      try {
        console.log('🔑 Attempting to use GOOGLE_CREDENTIALS environment variable');
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        console.log('✅ Successfully parsed GOOGLE_CREDENTIALS');
      } catch (err) {
        console.error('❌ Failed to parse GOOGLE_CREDENTIALS:', err.message);
      }
    }

    // If no credentials yet, try individual environment variables
    if (!credentials && process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      console.log('🔑 Attempting to use individual environment variables');
      try {
        credentials = {
          type: "service_account",
          project_id: process.env.GOOGLE_PROJECT_ID,
          private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          client_id: process.env.GOOGLE_CLIENT_ID,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL
        };
        console.log('✅ Successfully created credentials from environment variables');
      } catch (err) {
        console.error('❌ Failed to create credentials from environment variables:', err.message);
      }
    }

    // If still no credentials, try file system
    if (!credentials) {
      console.log('⚠️ No credentials found in environment variables, trying filesystem');
      const possiblePaths = [
        '/etc/secrets/btu-burial-034dc4726312.json',
        path.join(__dirname, 'btu-burial-034dc4726312.json'),
        path.join(process.cwd(), 'btu-burial-034dc4726312.json'),
      ];

      for (const credPath of possiblePaths) {
        try {
          console.log('🔑 Trying to read credentials from:', credPath);
          credentials = JSON.parse(await fs.readFile(credPath, 'utf8'));
          console.log('✅ Successfully read credentials from:', credPath);
          break;
        } catch (err) {
          console.log('⚠️ Could not read credentials from:', credPath);
        }
      }
    }

    if (!credentials) {
      console.warn('⚠️ No Google Drive credentials found. File upload features will be disabled.');
      return null;
    }

    // Validate the credentials
    if (!credentials.client_email || !credentials.private_key) {
      console.warn('⚠️ Invalid credentials format. File upload features will be disabled.');
      return null;
    }

    console.log('🔐 Initializing Google Auth with client email:', credentials.client_email);
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata.readonly']
    });

    // Test the credentials
    try {
      const drive = google.drive({ version: 'v3', auth });
      await drive.files.list({ pageSize: 1 });
      console.log('✅ Successfully tested Google Drive API access');
      return auth;
    } catch (err) {
      console.error('❌ Failed to test Google Drive API access:', err.message);
      return null;
    }
  } catch (err) {
    console.error('❌ Error in getGoogleAuth:', err.message);
    return null;
  }
}

// Function to ensure upload folder exists
async function ensureUploadFolder() {
  const drive = await drivePromise;
  const folderName = 'BTU_News_Images';
  
  try {
    console.log('🔍 Checking for existing upload folder...');
    
    // Check if folder already exists
    const response = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.data.files.length > 0) {
      const folderId = response.data.files[0].id;
      console.log('✅ Found existing folder:', folderId);
      return folderId;
    }

    // Create new folder if it doesn't exist
    console.log('📁 Creating new upload folder...');
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id'
    });

    const folderId = folder.data.id;
    
    // Make folder publicly accessible
    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    console.log('✅ Created new folder:', folderId);
    return folderId;
  } catch (err) {
    console.error('❌ Error ensuring upload folder:', err);
    throw err;
  }
}

// Initialize folder ID
let UPLOAD_FOLDER_ID = null;

// Initialize Google Drive client with error handling
const drivePromise = (async () => {
  try {
    console.log('🚀 Initializing Google Drive client...');
    const auth = await getGoogleAuth();
    console.log('✅ Google Auth initialized successfully');
    const drive = google.drive({ version: 'v3', auth });
    
    // Ensure upload folder exists
    UPLOAD_FOLDER_ID = await ensureUploadFolder();
    console.log('📁 Using upload folder:', UPLOAD_FOLDER_ID);
    
    return drive;
  } catch (err) {
    console.error('❌ Failed to initialize Google Drive client:', err);
    throw err;
  }
})();

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

// Configure multer for in-memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      console.log(`✅ File type accepted: ${file.mimetype}`);
      cb(null, true);
    } else {
      console.error(`❌ Invalid file type: ${file.mimetype}`);
      cb(new Error('Only image files (jpg, jpeg, png, gif) are allowed!'));
    }
  }
});

// Function to upload file to Google Drive
async function uploadToGoogleDrive(buffer, filename) {
  const drive = await drivePromise;
  
  if (!drive) {
    throw new Error('Google Drive integration is not available');
  }

  if (!UPLOAD_FOLDER_ID) {
    console.log('⚠️ Upload folder ID not set, ensuring folder exists...');
    try {
      UPLOAD_FOLDER_ID = await ensureUploadFolder();
    } catch (err) {
      throw new Error('Failed to create upload folder: ' + err.message);
    }
  }

  console.log('🚀 Starting Google Drive upload for:', filename);
  try {
    const fileMetadata = {
      name: filename,
      parents: [UPLOAD_FOLDER_ID],
      mimeType: filename.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' : filename.match(/\.png$/i) ? 'image/png' : 'image/gif'
    };

    console.log('📁 Creating file in Google Drive with metadata:', {
      ...fileMetadata,
      parentFolder: UPLOAD_FOLDER_ID
    });
    
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: fileMetadata.mimeType,
        body: buffer
      },
      fields: 'id'
    });

    const fileId = response.data.id;
    console.log('✅ File created in Google Drive with ID:', fileId);

    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });
    console.log('✅ File permissions set to public');

    return fileId; // Return just the file ID
  } catch (err) {
    console.error('❌ Error in uploadToGoogleDrive:', err);
    if (err.response) {
      console.error('Response error data:', err.response.data);
    }
    throw new Error(`Failed to upload file to Google Drive: ${err.message}`);
  }
}

// Function to get direct Google Drive URL
function getGoogleDriveDirectUrl(webContentLink) {
  if (!webContentLink) return null;
  // Convert the 'download' URL to a 'view' URL
  return webContentLink.replace('&export=download', '').replace('download', 'view');
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

  app.patch(`/api/admin/${name}/:id/read`, async (req, res) => {
    const { id } = req.params;
    const { read_status } = req.body;
    
    console.log(`Attempting to update read_status for ${table} id=${id} to ${read_status}`);
    
    if (!["read", "unread"].includes(read_status)) {
      console.error(`Invalid read_status value: ${read_status}`);
      return res.status(400).json({ message: "Invalid read_status" });
    }

    try {
      console.log(`Executing query: UPDATE ${table} SET read_status = ? WHERE id = ?`, [read_status, id]);
      
      const [result] = await pool.query(
        `UPDATE ${table} SET read_status = ? WHERE id = ?`,
        [read_status, id]
      );
      
      console.log(`Query result:`, result);
      
      if (result.affectedRows === 0) {
        console.error(`No record found in ${table} with id=${id}`);
        return res.status(404).json({ message: `Record not found in ${table}` });
      }
      
      const [updatedRecord] = await pool.query(
        `SELECT * FROM ${table} WHERE id = ?`,
        [id]
      );
      
      console.log(`Updated record:`, updatedRecord[0]);
      
      res.json({ 
        message: "Read status updated",
        record: updatedRecord[0]
      });
    } catch (err) {
      console.error(`Error updating read_status for ${table} id=${id}:`, err);
      res.status(500).json({
        message: "Error updating read status",
        error: err.message,
        details: err.stack
      });
    }
  });

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

// News Management Endpoints
app.get("/api/news", async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    console.log('📊 Fetching news items...');
    const [rows] = await pool.query(
      "SELECT * FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [parseInt(limit), offset]
    );
    const [countResult] = await pool.query("SELECT COUNT(*) as total FROM news");

    // Format the image URLs for response
    const formattedRows = rows.map(item => ({
      ...item,
      image_url: item.image_url ? `/proxy-image/${item.image_url}` : null
    }));
    
    console.log('✅ Returning formatted news items:', formattedRows.length);
    res.json({
      data: formattedRows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
        totalItems: countResult[0].total
      }
    });
  } catch (err) {
    console.error('❌ Error fetching news:', err);
    res.status(500).json({ message: "Error fetching news", error: err.message });
  }
});

app.post("/api/news", upload.single('image'), async (req, res) => {
  console.log('📝 Starting news creation...');
  console.log('Received file:', req.file ? {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  } : 'No file uploaded');
  
  const { text } = sanitizeObject(req.body);
  let image_url = null;

  if (!text && !req.file) {
    return res.status(400).json({ message: "Either text or image is required" });
  }

  if (req.file) {
    try {
      const fileId = await uploadToGoogleDrive(
        req.file.buffer, 
        `news-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`
      );
      image_url = fileId; // Store just the file ID
      console.log('✅ File ID saved:', fileId);
    } catch (err) {
      console.error('❌ Failed to upload image:', err);
      return res.status(500).json({ 
        message: "Failed to upload image", 
        error: err.message 
      });
    }
  }

  try {
    console.log('💾 Saving to database with image_url:', image_url);
    const [result] = await pool.query(
      "INSERT INTO news (text, image_url) VALUES (?, ?)",
      [text || null, image_url]
    );
    
    const [newNews] = await pool.query(
      "SELECT * FROM news WHERE id = ?",
      [result.insertId]
    );

    // Format the response
    const newsItem = {...newNews[0]};
    if (newsItem.image_url) {
      newsItem.image_url = `/proxy-image/${newsItem.image_url}`;
    }
    
    console.log('✅ News created successfully:', newsItem);
    res.status(201).json({
      message: "News added successfully",
      news: newsItem
    });
  } catch (err) {
    console.error('❌ Database error:', err);
    res.status(500).json({ 
      message: "Error adding news", 
      error: err.message
    });
  }
});

app.delete("/api/news/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [news] = await pool.query("SELECT * FROM news WHERE id = ?", [id]);
    if (news.length === 0) {
      return res.status(404).json({ message: "News not found" });
    }

    if (news[0].image_url && !news[0].image_url.startsWith('/uploads/news/')) {
      try {
        const fileId = news[0].image_url.match(/[-\w]{25,}/);
        if (fileId) {
          const drive = await drivePromise;
          await drive.files.delete({ fileId: fileId[0] });
          console.log(`Deleted Google Drive file: ${fileId[0]}`);
        }
      } catch (deleteErr) {
        console.error("Error deleting Google Drive file (may not exist):", deleteErr.message);
      }
    }

    const [result] = await pool.query("DELETE FROM news WHERE id = ?", [id]);
    res.json({ message: "News deleted successfully" });
  } catch (err) {
    console.error("Error deleting news:", err.message);
    res.status(500).json({ message: "Error deleting news", error: err.message });
  }
});

// Proxy endpoint for Google Drive images
app.get('/proxy-image/:fileId', async (req, res) => {
  const { fileId } = req.params;
  
  if (!fileId) {
    console.error('No fileId provided');
    return res.status(400).send('File ID is required');
  }

  // Clean up the fileId - remove any URL parts if present
  const cleanFileId = fileId.split('/').pop().split('?')[0];
  
  console.log('🔍 Proxying image request for file ID:', cleanFileId);

  try {
    const drive = await drivePromise;
    if (!drive) {
      console.error('Google Drive client not available');
      return res.status(503).json({
        message: 'Image service temporarily unavailable',
        error: 'Google Drive integration is not available'
      });
    }
    
    // First get the file metadata to verify it exists and is an image
    const file = await drive.files.get({
      fileId: cleanFileId,
      fields: 'id, mimeType, webContentLink'
    });

    if (!file.data.mimeType?.startsWith('image/')) {
      console.error(`Invalid file type: ${file.data.mimeType}`);
      return res.status(400).send('Not an image file');
    }

    console.log('✅ Found image file:', {
      id: file.data.id,
      mimeType: file.data.mimeType
    });

    // Get the file content
    const response = await drive.files.get({
      fileId: cleanFileId,
      alt: 'media'
    }, {
      responseType: 'stream'
    });

    // Set appropriate headers
    res.setHeader('Content-Type', file.data.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Pipe the response
    response.data.pipe(res);
  } catch (err) {
    console.error('❌ Error proxying image:', err);
    if (err.message.includes('File not found')) {
      return res.status(404).send('Image not found');
    }
    res.status(500).send('Error fetching image');
  }
});

// Debugging endpoints
app.get('/test-drive', async (req, res) => {
  try {
    const drive = await drivePromise;
    const response = await drive.files.list({ pageSize: 1 });
    res.json({ success: true, files: response.data.files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/test-secrets', async (req, res) => {
  try {
    const data = await fs.readFile('/etc/secrets/service-account.json', 'utf8');
    res.json({ success: true, client_email: JSON.parse(data).client_email });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a migration function to fix existing URLs
app.post("/api/admin/fix-news-images", async (req, res) => {
  try {
    // Get all news items with old upload paths
    const [news] = await pool.query(
      "SELECT * FROM news WHERE image_url LIKE '/uploads/news/%'"
    );

    console.log(`Found ${news.length} items with old image paths`);

    // Update each item to use null for image_url since old images are not accessible
    for (const item of news) {
      await pool.query(
        "UPDATE news SET image_url = NULL WHERE id = ?",
        [item.id]
      );
      console.log(`Updated news item ${item.id} to remove old image path`);
    }

    res.json({ 
      message: "Successfully updated old image paths",
      updatedCount: news.length
    });
  } catch (err) {
    console.error("Error fixing news images:", err);
    res.status(500).json({ 
      message: "Error fixing news images", 
      error: err.message 
    });
  }
});

// Add a test endpoint for Google Drive connectivity
app.get('/test-drive-auth', async (req, res) => {
  try {
    const drive = await drivePromise;
    const response = await drive.files.list({
      pageSize: 1,
      fields: 'files(id, name)',
    });
    res.json({
      success: true,
      message: 'Google Drive authentication successful',
      testFile: response.data.files[0]
    });
  } catch (err) {
    console.error('❌ Drive test failed:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Add a test endpoint for folder access
app.get('/test-folder', async (req, res) => {
  try {
    if (!UPLOAD_FOLDER_ID) {
      UPLOAD_FOLDER_ID = await ensureUploadFolder();
    }
    
    const drive = await drivePromise;
    const response = await drive.files.list({
      q: `'${UPLOAD_FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id, name, webViewLink)',
      pageSize: 10
    });
    
    res.json({
      success: true,
      folderId: UPLOAD_FOLDER_ID,
      files: response.data.files
    });
  } catch (err) {
    console.error('❌ Folder test failed:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Add a cleanup function for old image URLs
app.post("/api/admin/cleanup-image-urls", async (req, res) => {
  try {
    console.log('🧹 Starting image URL cleanup...');
    
    // Get all news items with old URLs
    const [news] = await pool.query(
      "SELECT * FROM news WHERE image_url IS NOT NULL AND image_url NOT LIKE '/proxy-image/%'"
    );

    console.log(`Found ${news.length} items with non-proxy image URLs`);
    let updatedCount = 0;
    let errorCount = 0;

    for (const item of news) {
      try {
        // Set invalid URLs to null
        await pool.query(
          "UPDATE news SET image_url = NULL WHERE id = ?",
          [item.id]
        );
        console.log(`✅ Cleaned up image URL for news ID: ${item.id}`);
        updatedCount++;
      } catch (err) {
        console.error(`❌ Error cleaning up news ID ${item.id}:`, err);
        errorCount++;
      }
    }

    res.json({
      message: "Image URL cleanup completed",
      totalProcessed: news.length,
      updatedCount,
      errorCount
    });
  } catch (err) {
    console.error("❌ Error in cleanup process:", err);
    res.status(500).json({
      message: "Error during cleanup process",
      error: err.message
    });
  }
});

// Add test endpoint for Google credentials
app.get('/api/test-google-env', (req, res) => {
  const envVars = {
    hasGoogleCreds: !!process.env.GOOGLE_CREDENTIALS,
    hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
    credsLength: process.env.GOOGLE_CREDENTIALS?.length || 0,
    privateKeyLength: process.env.GOOGLE_PRIVATE_KEY?.length || 0,
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || (process.env.GOOGLE_CREDENTIALS ? JSON.parse(process.env.GOOGLE_CREDENTIALS).client_email : null)
  };
  
  res.json({
    message: 'Google environment variables status',
    environment: process.env.NODE_ENV,
    variables: envVars
  });
});

// Modify the getImageUrl function in the frontend code
function getImageUrl(url) {
  if (!url) {
    return null;
  }
  
  // If it's already a proxy URL, return as is
  if (url.startsWith('/proxy-image/')) {
    return `${API_URL}${url}`;
  }
  
  // If it's a direct Google Drive file ID
  if (url.match(/^[-\w]{25,}$/)) {
    return `${API_URL}/proxy-image/${url}`;
  }
  
  // For external URLs (like picsum), return directly
  if (url.startsWith('http')) {
    return url;
  }
  
  return null;
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
