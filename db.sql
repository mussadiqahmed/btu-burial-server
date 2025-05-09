-- Drop the database if it already exists
DROP DATABASE IF EXISTS btuburia_btu;

-- Create the database
CREATE DATABASE btuburia_btu;

-- Select the database
USE btuburia_btu;
CREATE TABLE members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fullName VARCHAR(255) NOT NULL,
  contactNumber VARCHAR(15) NOT NULL,
  idNumber VARCHAR(50) NOT NULL,
  schoolName VARCHAR(255) NOT NULL,
  officeContact VARCHAR(15) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE funeral_notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  yourName VARCHAR(255) NOT NULL,
  idNumber VARCHAR(50) NOT NULL,
  deceasedName VARCHAR(255) NOT NULL,
  dependentName VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contactNumber VARCHAR(15) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE survey_responses (
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
);

CREATE TABLE election_registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fullName VARCHAR(255) NOT NULL,
  idNumber VARCHAR(50) NOT NULL,
  contactNumber VARCHAR(15) NOT NULL,
  uniqueId VARCHAR(9) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE news (
  id INT AUTO_INCREMENT PRIMARY KEY,
  text TEXT,
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert dummy data for news
INSERT INTO news (text, image_url, created_at) VALUES
('Community outreach program scheduled for next month.', NULL, '2025-05-01 10:00:00'),
(NULL, 'https://picsum.photos/800/600', '2025-05-02 12:00:00'),
('Annual meeting highlights and updates.', 'https://picsum.photos/800/600?random=2', '2025-05-03 15:00:00');