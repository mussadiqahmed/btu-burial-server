const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// MySQL Connection
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'btu_burial',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initializeDB() {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL Connected');

    // Create tables
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

    // Insert dummy data for members
    await connection.query(`
      INSERT IGNORE INTO members (fullName, contactNumber, idNumber, schoolName, officeContact) VALUES
      ('John Doe', '1234567890', 'ID123456', 'Springfield High', '0987654321'),
      ('Jane Smith', '2345678901', 'ID789012', 'Riverside Academy', '1122334455'),
      ('Alice Johnson', '3456789012', 'ID345678', 'Central School', '2233445566')
    `);

    // Insert dummy data for news
    await connection.query(`
      INSERT IGNORE INTO news (text, image_url, created_at) VALUES
      ('Community outreach program scheduled for next month.', NULL, '2025-05-01 10:00:00'),
      (NULL, 'https://picsum.photos/800/600', '2025-05-02 12:00:00'),
      ('Annual meeting highlights and updates.', 'https://picsum.photos/800/600?random=2', '2025-05-03 15:00:00')
    `);

    console.log('Database initialized with tables and dummy data');
    connection.release();
  } catch (err) {
    console.error('MySQL connection failed:', err.message);
    throw err;
  }
}

initializeDB().catch((err) => {
  console.error('Failed to initialize database:', err.message);
  process.exit(1);
});

// Test MySQL connection endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    res.json({ status: 'MySQL connected', tables: rows.map(row => Object.values(row)[0]) });
  } catch (err) {
    console.error('Test DB error:', err.message);
    res.status(500).json({ message: 'MySQL connection error', error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'Server is running', mysql: 'Connected' });
  } catch (err) {
    console.error('Health check error:', err.message);
    res.json({ status: 'Server is running', mysql: 'Disconnected' });
  }
});

// Membership Join
app.post('/api/membership/join', async (req, res) => {
  console.log('Received /api/membership/join request:', req.body);
  const { fullName, contactNumber, id, schoolName, officeContact } = req.body;
  if (!fullName || !contactNumber || !id || !schoolName || !officeContact) {
    console.log('Missing required fields:', req.body);
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO members (fullName, contactNumber, idNumber, schoolName, officeContact) VALUES (?, ?, ?, ?, ?)',
      [fullName, contactNumber, id, schoolName, officeContact]
    );
    console.log('Member added:', { id: result.insertId, fullName });
    res.json({ message: 'Thank you for joining BTU Burial. We will contact you within 48 hours.' });
  } catch (err) {
    console.error('Error in /api/membership/join:', err.message);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Funeral Notice
app.post('/api/funeral-notice', async (req, res) => {
  console.log('Received /api/funeral-notice request:', req.body);
  const { yourName, id, deceasedName, dependentName } = req.body;
  if (!yourName || !id || !deceasedName) {
    console.log('Missing required fields:', req.body);
    return res.status(400).json({ message: 'Required fields are missing' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO funeral_notices (yourName, idNumber, deceasedName, dependentName) VALUES (?, ?, ?, ?)',
      [yourName, id, deceasedName, dependentName || null]
    );
    console.log('Funeral notice added:', { id: result.insertId, yourName });
    res.json({ message: 'Thank you for submitting the funeral notice. We will contact you within 24 hours.' });
  } catch (err) {
    console.error('Error in /api/funeral-notice:', err.message);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Contact
app.post('/api/contact', async (req, res) => {
  console.log('Received /api/contact request:', req.body);
  const { name, contactNumber, message } = req.body;
  if (!name || !contactNumber || !message) {
    console.log('Missing required fields:', req.body);
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO contact_messages (name, contactNumber, message) VALUES (?, ?, ?)',
      [name, contactNumber, message]
    );
    console.log('Contact message added:', { id: result.insertId, name });
    res.json({ message: 'Thank you for your message. We will contact you within 24 hours.' });
  } catch (err) {
    console.error('Error in /api/contact:', err.message);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Survey
app.post('/api/survey', async (req, res) => {
  console.log('Received /api/survey request:', req.body);
  const { satisfaction, addressed, responseTime, courtesy, helpful, expectations, suggestions, recommend, difficulties, overall } = req.body;
  if (!satisfaction || !addressed || !responseTime || !courtesy || !helpful || !expectations || !recommend || !overall) {
    console.log('Missing required fields:', req.body);
    return res.status(400).json({ message: 'Required fields are missing' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO survey_responses (satisfaction, addressed, responseTime, courtesy, helpful, expectations, suggestions, recommend, difficulties, overall) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [satisfaction, addressed, responseTime, courtesy, helpful, expectations, suggestions || null, recommend, difficulties || null, overall]
    );
    console.log('Survey response added:', { id: result.insertId });
    res.json({ message: 'Thank you for your feedback.' });
  } catch (err) {
    console.error('Error in /api/survey:', err.message);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Election Registration
app.post('/api/election-reg', async (req, res) => {
  console.log('Received /api/election-reg request:', req.body);
  const { fullName, id, contactNumber } = req.body;
  if (!fullName || !id || !contactNumber) {
    console.log('Missing required fields:', req.body);
    return res.status(400).json({ message: 'All fields are required' });
  }
  const uniqueId = Math.random().toString(36).substr(2, 9);
  try {
    const [result] = await pool.query(
      'INSERT INTO election_registrations (fullName, idNumber, contactNumber, uniqueId) VALUES (?, ?, ?, ?)',
      [fullName, id, contactNumber, uniqueId]
    );
    console.log('Election registration added:', { id: result.insertId, fullName, uniqueId });
    res.json({ message: `Thank you for registering. Your unique ID will be sent via SMS: ${uniqueId}` });
  } catch (err) {
    console.error('Error in /api/election-reg:', err.message);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Check Membership
app.get('/api/members/check', async (req, res) => {
  console.log('Received /api/members/check request:', req.query);
  const { id } = req.query;
  try {
    const [rows] = await pool.query('SELECT * FROM members WHERE idNumber = ?', [id]);
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    console.error('Error in /api/members/check:', err.message);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Get News
app.get('/api/news', async (req, res) => {
  console.log('Received /api/news request');
  try {
    const [rows] = await pool.query('SELECT * FROM news ORDER BY created_at DESC');
    console.log('News fetched:', rows);
    res.json(rows || []); // Ensure an array is always returned
  } catch (err) {
    console.error('Error in /api/news:', err.message);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));