const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
require("dotenv").config();

const app = express();

// Trust proxy - required for rate limiting behind reverse proxy
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Image storage configuration
const IMAGE_DOMAIN = 'https://btuburial.co.bw';
const UPLOAD_DIR = 'public_html/uploads/news';

// cPanel storage functions
async function uploadToCPanel(buffer, filename) {
  try {
    console.log('🚀 Starting cPanel upload:', filename);
    
    // Ensure upload directory exists
    const uploadPath = path.join(process.cwd(), UPLOAD_DIR);
    await fs.mkdir(uploadPath, { recursive: true });
    
    // Save file to server
    const filePath = path.join(uploadPath, filename);
    await fs.writeFile(filePath, buffer);
    
    // Generate public URL (remove public_html from URL)
    const publicUrl = `${IMAGE_DOMAIN}/uploads/news/${filename}`;
    console.log('✅ File uploaded successfully');
    console.log('🔗 Public URL:', publicUrl);
    
    return {
      url: publicUrl,
      path: `uploads/news/${filename}` // Store relative path in database
    };
  } catch (error) {
    console.error('❌ Upload failed:', error);
    throw new Error(`File upload failed: ${error.message}`);
  }
}

async function deleteFromCPanel(filepath) {
  try {
    console.log('🗑️ Deleting file:', filepath);
    // Add public_html to the path for file operations
    const fullPath = path.join(process.cwd(), 'public_html', filepath);
    await fs.unlink(fullPath);
    console.log('✅ File deleted successfully');
    return true;
  } catch (error) {
    console.error('❌ Delete failed:', error);
    return false;
  }
}

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
    
    console.log('✅ Returning news items:', rows.length);
    res.json({
      data: rows,
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
  let image_path = null;

  if (!text && !req.file) {
    return res.status(400).json({ message: "Either text or image is required" });
  }

  if (req.file) {
    try {
      // Generate a unique filename
      const filename = `news-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
      
      // Upload to cPanel
      const { url, path: filePath } = await uploadToCPanel(req.file.buffer, filename);
      image_url = url;
      image_path = filePath;
      console.log('✅ File uploaded:', { url, path: filePath });
    } catch (err) {
      console.error('❌ Failed to upload image:', err);
      return res.status(500).json({ 
        message: "Failed to upload image", 
        error: err.message 
      });
    }
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO news (text, image_url, image_path) VALUES (?, ?, ?)",
      [text, image_url, image_path]
    );

    res.json({
      message: "News created successfully",
      id: result.insertId,
      text,
      image_url,
      image_path
    });
  } catch (err) {
    console.error('❌ Database error:', err);
    
    // Clean up uploaded file if database insert fails
    if (image_path) {
      await deleteFromCPanel(image_path).catch(console.error);
    }
    
    res.status(500).json({ 
      message: "Failed to create news", 
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

    // Delete the image from cPanel if it exists
    if (news[0].image_path) {
      await deleteFromCPanel(news[0].image_path).catch(console.error);
    }

    const [result] = await pool.query("DELETE FROM news WHERE id = ?", [id]);
    res.json({ message: "News deleted successfully" });
  } catch (err) {
    console.error("Error deleting news:", err.message);
    res.status(500).json({ message: "Error deleting news", error: err.message });
  }
});

// Admin Dashboard Endpoint
app.get("/api/admin/dashboard", async (req, res) => {
  try {
    // Get total news count
    const [newsCount] = await pool.query("SELECT COUNT(*) as total FROM news");
    
    // Get latest news
    const [latestNews] = await pool.query(
      "SELECT * FROM news ORDER BY created_at DESC LIMIT 5"
    );

    res.json({
      stats: {
        totalNews: newsCount[0].total
      },
      latestNews
    });
  } catch (err) {
    console.error('❌ Error fetching dashboard data:', err);
    res.status(500).json({ message: "Error fetching dashboard data", error: err.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
