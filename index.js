const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

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
  queueLimit: 0
});

// Initialize DB and create tables
(async function initializeDB() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL Connected');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fullName VARCHAR(255) NOT NULL,
        contactNumber VARCHAR(15) NOT NULL,
        idNumber VARCHAR(50) NOT NULL,
        schoolName VARCHAR(255) NOT NULL,
        officeContact VARCHAR(15) NOT NULL,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contactNumber VARCHAR(15) NOT NULL,
        message TEXT NOT NULL,
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

    // Dummy data (use IGNORE to prevent duplicate insert on restart)
    await connection.query(`
      INSERT IGNORE INTO members (fullName, contactNumber, idNumber, schoolName, officeContact)
      VALUES
      ('John Doe', '1234567890', 'ID123456', 'Springfield High', '0987654321'),
      ('Jane Smith', '2345678901', 'ID789012', 'Riverside Academy', '1122334455'),
      ('Alice Johnson', '3456789012', 'ID345678', 'Central School', '2233445566')
    `);

    await connection.query(`
      INSERT IGNORE INTO news (text, image_url, created_at)
      VALUES
      ('Community outreach program scheduled for next month.', NULL, '2025-05-01 10:00:00'),
      (NULL, 'https://picsum.photos/800/600', '2025-05-02 12:00:00'),
      ('Annual meeting highlights and updates.', 'https://picsum.photos/800/600?random=2', '2025-05-03 15:00:00')
    `);

    console.log('✅ Database initialized with tables and dummy data');
    connection.release();
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    process.exit(1);
  }
})();

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'Server running', mysql: 'Connected' });
  } catch (err) {
    res.json({ status: 'Server running', mysql: 'Disconnected' });
  }
});

// Test DB connection and list tables
app.get('/api/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    res.json({ tables: rows.map(row => Object.values(row)[0]) });
  } catch (err) {
    res.status(500).json({ message: 'Error testing DB', error: err.message });
  }
});

// Membership Join
app.post('/api/membership/join', async (req, res) => {
  const { fullName, contactNumber, id, schoolName, officeContact } = req.body;
  if (!fullName || !contactNumber || !id || !schoolName || !officeContact) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    await pool.query(
      'INSERT INTO members (fullName, contactNumber, idNumber, schoolName, officeContact) VALUES (?, ?, ?, ?, ?)',
      [fullName, contactNumber, id, schoolName, officeContact]
    );
    res.json({ message: 'Thank you for joining BTU Burial. We will contact you within 48 hours.' });
  } catch (err) {
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Funeral Notice
app.post('/api/funeral-notice', async (req, res) => {
  const { yourName, id, deceasedName, dependentName } = req.body;
  if (!yourName || !id || !deceasedName) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  try {
    await pool.query(
      'INSERT INTO funeral_notices (yourName, idNumber, deceasedName, dependentName) VALUES (?, ?, ?, ?)',
      [yourName, id, deceasedName, dependentName || null]
    );
    res.json({ message: 'Thank you for submitting the funeral notice. We will contact you within 24 hours.' });
  } catch (err) {
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Contact Message
app.post('/api/contact', async (req, res) => {
  const { name, contactNumber, message } = req.body;
  if (!name || !contactNumber || !message) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    await pool.query(
      'INSERT INTO contact_messages (name, contactNumber, message) VALUES (?, ?, ?)',
      [name, contactNumber, message]
    );
    res.json({ message: 'Thank you for your message. We will contact you within 24 hours.' });
  } catch (err) {
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Survey Response
app.post('/api/survey', async (req, res) => {
  const { satisfaction, addressed, responseTime, courtesy, helpful, expectations, suggestions, recommend, difficulties, overall } = req.body;
  if (!satisfaction || !addressed || !responseTime || !courtesy || !helpful || !expectations || !recommend || !overall) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  try {
    await pool.query(
      `INSERT INTO survey_responses 
      (satisfaction, addressed, responseTime, courtesy, helpful, expectations, suggestions, recommend, difficulties, overall) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [satisfaction, addressed, responseTime, courtesy, helpful, expectations, suggestions || null, recommend, difficulties || null, overall]
    );
    res.json({ message: 'Thank you for your feedback.' });
  } catch (err) {
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Election Registration
app.post('/api/election-reg', async (req, res) => {
  const { fullName, id, contactNumber } = req.body;
  if (!fullName || !id || !contactNumber) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const uniqueId = Math.random().toString(36).substr(2, 9).toUpperCase();
    await pool.query(
      'INSERT INTO election_registrations (fullName, idNumber, contactNumber, uniqueId) VALUES (?, ?, ?, ?)',
      [fullName, id, contactNumber, uniqueId]
    );
    res.json({ message: 'Election registration completed.', uniqueId });
  } catch (err) {
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
