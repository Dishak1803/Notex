-- ═══════════════════════════════════════════════════════════
--  NoteX — Full Database Schema
--  Run this file to set up or extend your existing database.
--  Safe to run on top of existing tables (uses IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

-- ── USERS (existing — add photo column if not present) ─────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo VARCHAR(512) DEFAULT NULL;

-- ── NOTES (existing — keep as is) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  filepath    VARCHAR(512) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subject (subject),
  INDEX idx_user    (user_id)
);

-- ── PPTS (existing — keep as is) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ppts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  filepath    VARCHAR(512) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subject (subject),
  INDEX idx_user    (user_id)
);

-- ── PREVIOUS YEAR PAPERS (NEW) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS papers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  filepath    VARCHAR(512) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subject (subject),
  INDEX idx_user    (user_id)
);

-- ── LIKES (NEW) ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS likes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  file_id     INT NOT NULL,
  file_type   ENUM('notes','ppts','papers') NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_like (user_id, file_id, file_type),
  INDEX idx_file (file_id, file_type)
);

-- ── BOOKMARKS (NEW) ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  file_id     INT NOT NULL,
  file_type   ENUM('notes','ppts','papers') NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_bookmark (user_id, file_id, file_type),
  INDEX idx_user (user_id)
);

-- ── DOWNLOADS (NEW) ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS downloads (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  file_id        INT NOT NULL,
  file_type      ENUM('notes','ppts','papers') NOT NULL,
  downloaded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_file (file_id, file_type),
  INDEX idx_user (user_id)
);

-- ── COMMENTS (NEW) ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  file_id     INT NOT NULL,
  file_type   ENUM('notes','ppts','papers') NOT NULL,
  comment     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_file (file_id, file_type)
);

-- ── STUDY PLANNER (NEW) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_tasks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  task        VARCHAR(512) NOT NULL,
  subject     VARCHAR(255) DEFAULT '',
  due_date    DATE DEFAULT NULL,
  status      ENUM('pending','done') DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);

-- ── STREAK SYSTEM (NEW) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS streaks (
  user_id            INT PRIMARY KEY,
  current_streak     INT DEFAULT 0,
  last_active_date   DATE DEFAULT NULL
);

-- ── MCQ QUESTIONS (NEW — admin adds questions) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS mcq_questions (
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

-- ── MCQ SCORES (NEW) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mcq_scores (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  score       INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);

-- ═══════════════════════════════════════════════════════════
--  SAMPLE MCQ QUESTIONS (optional — to test the game)
-- ═══════════════════════════════════════════════════════════
INSERT IGNORE INTO mcq_questions (subject, question, option_a, option_b, option_c, option_d, correct_option) VALUES
('Data Structures', 'Which data structure uses LIFO ordering?',       'Queue','Stack','Linked List','Tree', 1),
('Data Structures', 'What is the time complexity of binary search?',  'O(n)','O(n²)','O(log n)','O(1)',  2),
('Data Structures', 'Which traversal visits root first?',             'Inorder','Postorder','Preorder','Level-order', 2),
('Data Structures', 'Array index starts from?',                       '1','0','-1','Depends on language', 1),
('Data Structures', 'Which structure uses FIFO?',                     'Stack','Array','Queue','Tree', 2),
('Algorithms',      'Quicksort average time complexity?',             'O(n)','O(n log n)','O(n²)','O(log n)', 1),
('Algorithms',      'Which algorithm finds shortest path?',           'DFS','BFS','Dijkstra','Prim', 2),
('Algorithms',      'Merge sort space complexity?',                   'O(1)','O(n)','O(log n)','O(n²)', 1),
('DBMS',            'SQL stands for?',                                'Simple Query Language','Structured Query Language','Sequential Query Language','Standard Query Language', 1),
('DBMS',            'Which key uniquely identifies a record?',        'Foreign Key','Candidate Key','Primary Key','Super Key', 2),
('Machine Learning','Supervised learning requires?',                  'Unlabeled data','Labeled data','No data','Clustered data', 1),
('Machine Learning','Overfitting means the model?',                   'Underfits training data','Fits training too well, fails on new data','Has high bias','Is ideal', 1),
('Networking',      'IP stands for?',                                 'Internet Protocol','Internal Protocol','Intranet Protocol','Interface Protocol', 0),
('Networking',      'Which layer handles routing?',                   'Data Link','Transport','Network','Application', 2);