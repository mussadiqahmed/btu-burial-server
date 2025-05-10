-- Drop the database if it already exists
DROP DATABASE IF EXISTS btuburia_btu;

-- Create the database
CREATE DATABASE btuburia_btu;

-- Select the database
USE btuburia_btu;

-- Drop tables if they exist (in reverse order of dependencies if any)
DROP TABLE IF EXISTS news;
DROP TABLE IF EXISTS election_registrations;
DROP TABLE IF EXISTS survey_responses;
DROP TABLE IF EXISTS contact_messages;
DROP TABLE IF EXISTS funeral_notices;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS admin_users;

-- Admin Users Table
CREATE TABLE admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Members Table
CREATE TABLE members (
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
);

-- Funeral Notices Table
CREATE TABLE funeral_notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  yourName VARCHAR(255) NOT NULL,
  idNumber VARCHAR(50) NOT NULL,
  deceasedName VARCHAR(255) NOT NULL,
  dependentName VARCHAR(255),
  read_status ENUM('unread', 'read') DEFAULT 'unread',
  admin_reply TEXT,
  status ENUM('pending', 'done') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contact Messages Table
CREATE TABLE contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contactNumber VARCHAR(15) NOT NULL,
  message TEXT NOT NULL,
  read_status ENUM('unread', 'read') DEFAULT 'unread',
  admin_reply TEXT,
  status ENUM('pending', 'done') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Survey Responses Table
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
  read_status ENUM('unread', 'read') DEFAULT 'unread',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Election Registrations Table
CREATE TABLE election_registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fullName VARCHAR(255) NOT NULL,
  idNumber VARCHAR(50) NOT NULL,
  contactNumber VARCHAR(15) NOT NULL,
  uniqueId VARCHAR(9) NOT NULL,
  read_status ENUM('unread', 'read') DEFAULT 'unread',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- News Table
CREATE TABLE news (
  id INT AUTO_INCREMENT PRIMARY KEY,
  text TEXT,
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert dummy data for admin_users
INSERT INTO admin_users (username, password, created_at) VALUES
('jama', '$2b$10$6fXg7bY8z9Qz7kW5j3m8O.r3kY7bZ9Qz7kW5j3m8O.r3kY7bZ9Qz7', '2025-05-10 08:00:00'),
('btuburia', '$2b$10$9hY2m4N6v8Rx0tL2p5q9S.t5mY2m4N6v8Rx0tL2p5q9S.t5mY2m4N', '2025-05-10 08:00:00');

-- Insert dummy data for news
INSERT INTO news (text, image_url, created_at) VALUES
('Community outreach program scheduled for next month.', NULL, '2025-05-01 10:00:00'),
(NULL, 'https://picsum.photos/800/600', '2025-05-02 12:00:00'),
('Annual meeting highlights and updates.', 'https://picsum.photos/800/600?random=2', '2025-05-03 15:00:00');
