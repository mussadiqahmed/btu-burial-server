const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = process.env.MONGODB_URI || 'mongodb+srv://tjama:tjama@cluster0.reg0b8e.mongodb.net/';
const client = new MongoClient(uri);

async function connectDB() {
  try {
    await client.connect();
    console.log('MongoDB Connected');
    const db = client.db('btu_burial');

    const collections = [
      'members',
      'tombstone_purchases',
      'funeral_notices',
      'contact_messages',
      'survey_responses',
      'election_registrations',
    ];
    for (const collection of collections) {
      await db.createCollection(collection).catch(() => console.log(`${collection} already exists`));
    }

    const members = db.collection('members');
    await members.deleteMany({});
    await members.insertMany([
      { fullName: 'John Doe', contactNumber: '1234567890', idNumber: 'ID123456', schoolName: 'Springfield High', officeContact: '0987654321' },
      { fullName: 'Jane Smith', contactNumber: '2345678901', idNumber: 'ID789012', schoolName: 'Riverside Academy', officeContact: '1122334455' },
      { fullName: 'Alice Johnson', contactNumber: '3456789012', idNumber: 'ID345678', schoolName: 'Central School', officeContact: '2233445566' },
    ]);

    const tombstonePurchases = db.collection('tombstone_purchases');
    await tombstonePurchases.deleteMany({});
    await tombstonePurchases.insertMany([
      { fullName: 'John Doe', contactNumber: '1234567890', idNumber: 'ID123456', schoolName: 'Springfield High', officeContact: '0987654321' },
      { fullName: 'Jane Smith', contactNumber: '2345678901', idNumber: 'ID789012', schoolName: 'Riverside Academy', officeContact: '1122334455' },
    ]);

    console.log('Dummy data inserted');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    throw err;
  }
}

connectDB().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Test MongoDB connection endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const db = client.db('btu_burial');
    const collections = await db.listCollections().toArray();
    res.json({ status: 'MongoDB connected', collections: collections.map((c) => c.name) });
  } catch (err) {
    console.error('Test DB error:', err);
    res.status(500).json({ message: 'MongoDB connection error', error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', mongodb: client.topology.isConnected() ? 'Connected' : 'Disconnected' });
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
    const db = client.db('btu_burial');
    const members = db.collection('members');
    const result = await members.insertOne({
      fullName,
      contactNumber,
      idNumber: id,
      schoolName,
      officeContact,
    });
    console.log('Member added:', { id: result.insertedId, fullName });
    res.json({ message: 'Thank you for joining BTU Burial. We will contact you within 48 hours.' });
  } catch (err) {
    console.error('Error in /api/membership/join:', err);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Membership Tombstone Package
app.post('/api/membership/tombstone', async (req, res) => {
  console.log('Received /api/membership/tombstone request:', req.body);
  const { fullName, contactNumber, id, schoolName, officeContact } = req.body;
  if (!fullName || !contactNumber || !id || !schoolName || !officeContact) {
    console.log('Missing required fields:', req.body);
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    const db = client.db('btu_burial');
    const members = db.collection('members');
    const member = await members.findOne({ idNumber: id });
    if (!member) {
      console.log('Member not found for idNumber:', id);
      return res.status(400).json({ message: 'You must be a member to buy a tombstone package.' });
    }
    const tombstonePurchases = db.collection('tombstone_purchases');
    const result = await tombstonePurchases.insertOne({
      fullName,
      contactNumber,
      idNumber: id,
      schoolName,
      officeContact,
    });
    console.log('Tombstone purchase added:', { id: result.insertedId, fullName });
    res.json({ message: 'Thank you for your purchase. We will contact you within 48 hours.' });
  } catch (err) {
    console.error('Error in /api/membership/tombstone:', err);
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
    const db = client.db('btu_burial');
    const funeralNotices = db.collection('funeral_notices');
    const result = await funeralNotices.insertOne({
      yourName,
      idNumber: id,
      deceasedName,
      dependentName,
    });
    console.log('Funeral notice added:', { id: result.insertedId, yourName });
    res.json({ message: 'Thank you for submitting the funeral notice. We will contact you within 24 hours.' });
  } catch (err) {
    console.error('Error in /api/funeral-notice:', err);
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
    const db = client.db('btu_burial');
    const contactMessages = db.collection('contact_messages');
    const result = await contactMessages.insertOne({
      name,
      contactNumber,
      message,
    });
    console.log('Contact message added:', { id: result.insertedId, name });
    res.json({ message: 'Thank you for your message. We will contact you within 24 hours.' });
  } catch (err) {
    console.error('Error in /api/contact:', err);
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
    const db = client.db('btu_burial');
    const surveyResponses = db.collection('survey_responses');
    const result = await surveyResponses.insertOne({
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
    });
    console.log('Survey response added:', { id: result.insertedId });
    res.json({ message: 'Thank you for your feedback.' });
  } catch (err) {
    console.error('Error in /api/survey:', err);
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
    const db = client.db('btu_burial');
    const electionRegistrations = db.collection('election_registrations');
    const result = await electionRegistrations.insertOne({
      fullName,
      idNumber: id,
      contactNumber,
      uniqueId,
    });
    console.log('Election registration added:', { id: result.insertedId, fullName, uniqueId });
    res.json({ message: `Thank you for registering. Your unique ID will be sent via SMS: ${uniqueId}` });
  } catch (err) {
    console.error('Error in /api/election-reg:', err);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Check Membership (for membership.js tombstone validation)
app.get('/api/members/check', async (req, res) => {
  console.log('Received /api/members/check request:', req.query);
  const { id } = req.query;
  try {
    const db = client.db('btu_burial');
    const members = db.collection('members');
    const member = await members.findOne({ idNumber: id });
    res.json({ exists: !!member });
  } catch (err) {
    console.error('Error in /api/members/check:', err);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));