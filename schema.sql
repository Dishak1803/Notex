-- ═══════════════════════════════════════════════════════════
--  NoteX — Full Database Schema
--  Run this file once to set up the entire database from scratch.
-- ═══════════════════════════════════════════════════════════

-- Create and select the database
CREATE DATABASE IF NOT EXISTS login_system;
USE login_system;

-- ── USERS ─────────────────────────────────────────────────────────────────────
-- Stores all registered users with OTP-based verification
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(100) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  field       VARCHAR(100) DEFAULT NULL,
  branch      VARCHAR(100) DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  otp         VARCHAR(6) DEFAULT NULL,
  is_verified TINYINT(1) DEFAULT 0,
  photo       VARCHAR(512) DEFAULT NULL
);

-- ── NOTES ─────────────────────────────────────────────────────────────────────
-- Stores uploaded note files organized by subject
CREATE TABLE notes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  filepath    VARCHAR(512) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subject (subject),
  INDEX idx_user    (user_id)
);

-- ── PPTS ──────────────────────────────────────────────────────────────────────
-- Stores uploaded PowerPoint/presentation files organized by subject
CREATE TABLE ppts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  filepath    VARCHAR(512) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subject (subject),
  INDEX idx_user    (user_id)
);

-- ── PREVIOUS YEAR PAPERS ──────────────────────────────────────────────────────
-- Stores uploaded previous year exam papers organized by subject
CREATE TABLE papers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  filepath    VARCHAR(512) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subject (subject),
  INDEX idx_user    (user_id)
);

-- ── LIKES ─────────────────────────────────────────────────────────────────────
-- Tracks upvotes/downvotes on notes, ppts, and papers (one per user per file)
CREATE TABLE likes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  file_id     INT NOT NULL,
  file_type   ENUM('notes','ppts','papers') NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_like (user_id, file_id, file_type),
  INDEX idx_file (file_id, file_type)
);

-- ── BOOKMARKS ─────────────────────────────────────────────────────────────────
-- Lets users save files to their personal saved list
CREATE TABLE bookmarks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  file_id     INT NOT NULL,
  file_type   ENUM('notes','ppts','papers') NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_bookmark (user_id, file_id, file_type),
  INDEX idx_user (user_id)
);

-- ── DOWNLOADS ─────────────────────────────────────────────────────────────────
-- Logs every file download per user for stats and leaderboard tracking
CREATE TABLE downloads (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  file_id        INT NOT NULL,
  file_type      ENUM('notes','ppts','papers') NOT NULL,
  downloaded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_file (file_id, file_type),
  INDEX idx_user (user_id)
);

-- ── COMMENTS ──────────────────────────────────────────────────────────────────
-- Stores user comments on notes, ppts, and papers
CREATE TABLE comments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  file_id     INT NOT NULL,
  file_type   ENUM('notes','ppts','papers') NOT NULL,
  comment     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_file (file_id, file_type)
);

-- ── STUDY PLANNER ─────────────────────────────────────────────────────────────
-- Stores personal study tasks created by each user with due dates
CREATE TABLE study_tasks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  task        VARCHAR(512) NOT NULL,
  subject     VARCHAR(255) DEFAULT '',
  due_date    DATE DEFAULT NULL,
  status      ENUM('pending','done') DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);

-- ── STREAKS ───────────────────────────────────────────────────────────────────
-- Tracks daily login streaks per user for the leaderboard
CREATE TABLE streaks (
  user_id            INT PRIMARY KEY,
  current_streak     INT DEFAULT 0,
  last_active_date   DATE DEFAULT NULL
);

-- ── MCQ QUESTIONS ─────────────────────────────────────────────────────────────
-- Stores AI-generated MCQ questions per subject for the bridge run game
CREATE TABLE mcq_questions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  subject        VARCHAR(255) NOT NULL,
  question       TEXT NOT NULL,
  option_a       VARCHAR(512) NOT NULL,
  option_b       VARCHAR(512) NOT NULL,
  option_c       VARCHAR(512) NOT NULL,
  option_d       VARCHAR(512) NOT NULL,
  correct_option TINYINT NOT NULL COMMENT '0=A, 1=B, 2=C, 3=D',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subject (subject)
);

-- ── MCQ SCORES ────────────────────────────────────────────────────────────────
-- Records each game session score per user per subject
CREATE TABLE mcq_scores (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  score       INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);