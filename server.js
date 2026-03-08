const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express    = require("express");
const bodyParser = require("body-parser");
const bcrypt     = require("bcryptjs");
const session    = require("express-session");
const path       = require("path");
const open       = require("open").default;
const multer     = require("multer");
const fs         = require("fs");
const nodemailer = require("nodemailer");
require("dotenv").config();

const db  = require("./db");
const app = express();
const PORT = 3000;

// ── OTP ────────────────────────────────────────────────────────────────────────
let otpStore = {};
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

// ── DIRECTORIES ────────────────────────────────────────────────────────────────
const DIRS = {
  notes:   path.join(__dirname, "uploads", "notes"),
  ppts:    path.join(__dirname, "uploads", "ppts"),
  papers:  path.join(__dirname, "uploads", "papers"),
  avatars: path.join(__dirname, "uploads", "avatars"),
  temp:    path.join(__dirname, "uploads", "temp"),
};
Object.values(DIRS).forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── MULTER – FILES ─────────────────────────────────────────────────────────────
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type || "note";
    const dir  = { ppt:"ppts", paper:"papers" }[type] || "notes";
    cb(null, DIRS[dir]);
  },
  filename: (req, file, cb) => {
    const uid = Date.now() + "-" + Math.round(Math.random() * 1e6);
    cb(null, uid + path.extname(file.originalname));
  }
});
const upload = multer({ storage: fileStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── MULTER – AVATARS ───────────────────────────────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DIRS.avatars),
  filename: (req, file, cb) => cb(null, `user_${req.session.userId}_${Date.now()}${path.extname(file.originalname)}`)
});
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── MULTER – AI TEMP ───────────────────────────────────────────────────────────
const aiUpload = multer({
  dest: DIRS.temp,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain", "text/markdown",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = [".pdf",".doc",".docx",".ppt",".pptx",".txt",".md",".jpg",".jpeg",".png",".webp",".heic",".heif"];
    if (allowed.includes(file.mimetype) || allowedExts.includes(ext)) cb(null, true);
    else cb(new Error("Unsupported file type"));
  }
});

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────────
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(session({
  secret: process.env.SESSION_SECRET || "notex_secret_2024",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
}));

function requireLogin(req, res, next) {
  if (req.session.loggedIn) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ── EMAIL ──────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// ════════════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════════

app.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, error: "Email required" });
  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER, to: email,
      subject: "Your NoteX OTP",
      text: `Your OTP is ${otp}. Expires in 5 minutes.`
    });
    res.json({ success: true });
  } catch(e) {
    console.error(e);
    res.json({ success: false, error: "Failed to send OTP" });
  }
});

app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  if (!otpStore[email]) return res.json({ success: false, error: "No OTP found" });
  const rec = otpStore[email];
  if (Date.now() > rec.expires) { delete otpStore[email]; return res.json({ success: false, error: "OTP expired" }); }
  if (String(rec.otp) === String(otp)) {
    delete otpStore[email];
    req.session.verifiedEmail = email;
    return res.json({ success: true });
  }
  res.json({ success: false, error: "Invalid OTP" });
});

app.post("/register", (req, res) => {
  const { name, email, password, confirm_password } = req.body;
  if (!name || !email || !password || !confirm_password) return res.status(400).json({ error: "All fields required" });
  if (password !== confirm_password) return res.status(400).json({ error: "Passwords do not match" });
  if (!strongPasswordRegex.test(password)) return res.status(400).json({ error: "Password too weak" });
  if (req.session.verifiedEmail !== email) return res.status(400).json({ error: "Email not verified" });

  db.query("SELECT id FROM users WHERE email=?", [email], (err, r) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (r.length) return res.status(400).json({ error: "Email already registered" });
    const hash = bcrypt.hashSync(password, 12);
    db.query("INSERT INTO users (name,email,password) VALUES (?,?,?)", [name, email, hash], (err, ins) => {
      if (err) return res.status(500).json({ error: "DB error" });
      delete req.session.verifiedEmail;
      req.session.loggedIn = true;
      req.session.userId   = ins.insertId;
      req.session.name     = name;
      req.session.email    = email;
      res.json({ success: true });
    });
  });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.query("SELECT * FROM users WHERE email=?", [email], (err, r) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!r.length) return res.status(404).json({ error: "Account not found" });
    if (!bcrypt.compareSync(password, r[0].password)) return res.status(401).json({ error: "Incorrect password" });
    req.session.loggedIn = true;
    req.session.userId   = r[0].id;
    req.session.name     = r[0].name;
    req.session.email    = r[0].email;
    res.json({ success: true });
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

app.get("/dashboard.html", (req, res, next) => {
  if (!req.session.loggedIn) return res.redirect("/login.html");
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});
app.get("/", (req, res) => res.redirect("/login.html"));

// ── USER INFO ──────────────────────────────────────────────────────────────────
app.get("/user-info", requireLogin, (req, res) => {
  db.query("SELECT id, name, email, field, branch, photo FROM users WHERE id=?", [req.session.userId], (err, r) => {
    if (err || !r.length) return res.json({});
    res.json(r[0]);
  });
});

app.post("/save-field", requireLogin, (req, res) => {
  const { field, branch } = req.body;
  if (!field || !branch) return res.status(400).json({ error: "Missing data" });
  db.query("UPDATE users SET field=?, branch=? WHERE id=?", [field, branch, req.session.userId], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ success: true });
  });
});

// ── PROFILE PHOTO ──────────────────────────────────────────────────────────────
app.post("/upload-photo", requireLogin, uploadAvatar.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const url = "/uploads/avatars/" + req.file.filename;
  db.query("UPDATE users SET photo=? WHERE id=?", [url, req.session.userId], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ success: true, url });
  });
});

// ── PROFILE STATS ──────────────────────────────────────────────────────────────
app.get("/profile-stats", requireLogin, (req, res) => {
  const uid = req.session.userId;
  db.query(`
    SELECT
      (SELECT COUNT(*) FROM notes   WHERE user_id=?) +
      (SELECT COUNT(*) FROM ppts    WHERE user_id=?) +
      (SELECT COUNT(*) FROM papers  WHERE user_id=?) AS uploads,
      (SELECT COUNT(*) FROM downloads WHERE user_id=?) AS downloads
  `, [uid, uid, uid, uid], (err, r) => {
    if (err) return res.json({ uploads:0, downloads:0 });
    res.json(r[0]);
  });
});

// ── MY UPLOADS ─────────────────────────────────────────────────────────────────
app.get("/my-uploads", requireLogin, (req, res) => {
  const uid = req.session.userId;
  db.query(`
    SELECT id, subject, filename, filepath, uploaded_at, 'note' AS file_type,
      (SELECT COUNT(*) FROM likes WHERE file_id=id AND file_type='note' AND vote='up')   AS upvotes,
      (SELECT COUNT(*) FROM likes WHERE file_id=id AND file_type='note' AND vote='down') AS downvotes,
      0 AS bookmarked, NULL AS my_vote
    FROM notes WHERE user_id=?
    UNION ALL
    SELECT id, subject, filename, filepath, uploaded_at, 'ppt' AS file_type,
      (SELECT COUNT(*) FROM likes WHERE file_id=id AND file_type='ppt' AND vote='up')   AS upvotes,
      (SELECT COUNT(*) FROM likes WHERE file_id=id AND file_type='ppt' AND vote='down') AS downvotes,
      0 AS bookmarked, NULL AS my_vote
    FROM ppts WHERE user_id=?
    UNION ALL
    SELECT id, subject, filename, filepath, uploaded_at, 'paper' AS file_type,
      (SELECT COUNT(*) FROM likes WHERE file_id=id AND file_type='paper' AND vote='up')   AS upvotes,
      (SELECT COUNT(*) FROM likes WHERE file_id=id AND file_type='paper' AND vote='down') AS downvotes,
      0 AS bookmarked, NULL AS my_vote
    FROM papers WHERE user_id=?
    ORDER BY uploaded_at DESC
  `, [uid, uid, uid], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
//  FILE UPLOAD
// ════════════════════════════════════════════════════════════════════════════════
app.post("/upload-file", requireLogin, upload.single("file"), (req, res) => {
  const { subject, type } = req.body;
  if (!req.file || !subject || !type) return res.status(400).json({ error: "Missing data" });

  const uid      = req.session.userId;
  const filename = req.file.originalname;
  const subdir   = { ppt:"ppts", paper:"papers" }[type] || "notes";
  const filepath = `uploads/${subdir}/${req.file.filename}`;
  const table    = { ppt:"ppts", paper:"papers" }[type] || "notes";

  db.query(
    `INSERT INTO ${table} (user_id, subject, filename, filepath) VALUES (?,?,?,?)`,
    [uid, subject, filename, filepath],
    (err) => {
      if (err) { fs.unlink(req.file.path, ()=>{}); return res.status(500).json({ error: "DB error" }); }
      updateStreak(uid);
      res.json({ success: true });
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════════
//  GET FILES
// ════════════════════════════════════════════════════════════════════════════════
function makeFilesRoute(table, endpoint, fileType) {
  app.get(`${endpoint}/:subject`, requireLogin, (req, res) => {
    const subject = decodeURIComponent(req.params.subject);
    const uid     = req.session.userId;
    db.query(`
      SELECT f.*,
        COALESCE((SELECT COUNT(*) FROM likes WHERE file_id=f.id AND file_type=? AND vote='up'),0)   AS upvotes,
        COALESCE((SELECT COUNT(*) FROM likes WHERE file_id=f.id AND file_type=? AND vote='down'),0) AS downvotes,
        (SELECT vote FROM likes WHERE file_id=f.id AND file_type=? AND user_id=?)                   AS my_vote,
        COALESCE((SELECT 1 FROM bookmarks WHERE file_id=f.id AND file_type=? AND user_id=? LIMIT 1),0) AS bookmarked
      FROM ${table} f
      WHERE LOWER(TRIM(f.subject))=LOWER(TRIM(?))
      ORDER BY f.uploaded_at DESC
    `, [fileType, fileType, fileType, uid, fileType, uid, subject], (err, rows) => {
      if (err) {
        db.query(`SELECT * FROM ${table} WHERE LOWER(TRIM(subject))=LOWER(TRIM(?)) ORDER BY uploaded_at DESC`, [subject], (err2, rows2) => {
          if (err2) return res.status(500).json({ error: err2.sqlMessage || err2.message });
          return res.json(rows2.map(r => ({ ...r, upvotes:0, downvotes:0, my_vote:null, bookmarked:false })));
        });
        return;
      }
      res.json(rows.map(r => ({ ...r, bookmarked: !!r.bookmarked, my_vote: r.my_vote || null })));
    });
  });
}
makeFilesRoute("notes",  "/notes",  "note");
makeFilesRoute("ppts",   "/ppts",   "ppt");
makeFilesRoute("papers", "/papers", "paper");

// ════════════════════════════════════════════════════════════════════════════════
//  DELETE FILES
// ════════════════════════════════════════════════════════════════════════════════
function makeDeleteRoute(table, endpoint) {
  app.delete(`${endpoint}/:id`, requireLogin, (req, res) => {
    const uid = req.session.userId;
    db.query(`SELECT * FROM ${table} WHERE id=? AND user_id=?`, [req.params.id, uid], (err, rows) => {
      if (err || !rows.length) return res.status(404).json({ error: "Not found" });
      const fp = path.join(__dirname, rows[0].filepath);
      db.query(`DELETE FROM ${table} WHERE id=?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: "DB error" });
        fs.unlink(fp, ()=>{});
        res.json({ success: true });
      });
    });
  });
}
makeDeleteRoute("notes",  "/delete-note");
makeDeleteRoute("ppts",   "/delete-ppt");
makeDeleteRoute("papers", "/delete-paper");

// ════════════════════════════════════════════════════════════════════════════════
//  LIKES (upvote / downvote)
// ════════════════════════════════════════════════════════════════════════════════
app.post("/toggle-like", requireLogin, (req, res) => {
  const { file_id, file_type, vote } = req.body;
  const uid = req.session.userId;

  db.query(
    "SELECT id, vote FROM likes WHERE user_id=? AND file_id=? AND file_type=?",
    [uid, file_id, file_type],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });

      const sendCounts = (action) => {
        db.query(
          `SELECT SUM(vote='up') AS upvotes, SUM(vote='down') AS downvotes
           FROM likes WHERE file_id=? AND file_type=?`,
          [file_id, file_type],
          (err, r) => {
            if (err) return res.status(500).json({ error: "DB error" });
            res.json({
              action,
              upvotes:   parseInt(r[0].upvotes)   || 0,
              downvotes: parseInt(r[0].downvotes) || 0
            });
          }
        );
      };

      if (!rows.length) {
        db.query(
          "INSERT INTO likes (user_id, file_id, file_type, vote) VALUES (?,?,?,?)",
          [uid, file_id, file_type, vote],
          (err) => {
            if (err) return res.status(500).json({ error: "DB error" });
            sendCounts(vote === "up" ? "upvoted" : "downvoted");
          }
        );
      } else if (rows[0].vote === vote) {
        db.query(
          "DELETE FROM likes WHERE user_id=? AND file_id=? AND file_type=?",
          [uid, file_id, file_type],
          (err) => {
            if (err) return res.status(500).json({ error: "DB error" });
            sendCounts("removed");
          }
        );
      } else {
        db.query(
          "UPDATE likes SET vote=? WHERE user_id=? AND file_id=? AND file_type=?",
          [vote, uid, file_id, file_type],
          (err) => {
            if (err) return res.status(500).json({ error: "DB error" });
            sendCounts(vote === "up" ? "upvoted" : "downvoted");
          }
        );
      }
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════════
//  BOOKMARKS
// ════════════════════════════════════════════════════════════════════════════════
app.post("/toggle-bookmark", requireLogin, (req, res) => {
  const { file_id, file_type } = req.body;
  const uid = req.session.userId;
  db.query("SELECT id FROM bookmarks WHERE user_id=? AND file_id=? AND file_type=?", [uid, file_id, file_type], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (rows.length) {
      db.query("DELETE FROM bookmarks WHERE user_id=? AND file_id=? AND file_type=?", [uid, file_id, file_type], (err) => {
        if (err) return res.status(500).json({ error: "DB error" });
        res.json({ action: "removed" });
      });
    } else {
      db.query("INSERT INTO bookmarks (user_id, file_id, file_type) VALUES (?,?,?)", [uid, file_id, file_type], (err) => {
        if (err) return res.status(500).json({ error: "DB error" });
        res.json({ action: "saved" });
      });
    }
  });
});

app.get("/bookmarks", requireLogin, (req, res) => {
  const uid = req.session.userId;
  db.query(`
    SELECT 'note' AS file_type, f.*, b.id AS bk_id,
      (SELECT COUNT(*) FROM likes WHERE file_id=f.id AND file_type='note' AND vote='up')   AS upvotes,
      (SELECT COUNT(*) FROM likes WHERE file_id=f.id AND file_type='note' AND vote='down') AS downvotes,
      (SELECT vote     FROM likes WHERE file_id=f.id AND file_type='note' AND user_id=?)   AS my_vote
    FROM bookmarks b JOIN notes f ON b.file_id=f.id AND b.file_type='note' WHERE b.user_id=?
    UNION ALL
    SELECT 'ppt' AS file_type, f.*, b.id AS bk_id,
      (SELECT COUNT(*) FROM likes WHERE file_id=f.id AND file_type='ppt' AND vote='up')   AS upvotes,
      (SELECT COUNT(*) FROM likes WHERE file_id=f.id AND file_type='ppt' AND vote='down') AS downvotes,
      (SELECT vote     FROM likes WHERE file_id=f.id AND file_type='ppt' AND user_id=?)   AS my_vote
    FROM bookmarks b JOIN ppts f ON b.file_id=f.id AND b.file_type='ppt' WHERE b.user_id=?
    UNION ALL
    SELECT 'paper' AS file_type, f.*, b.id AS bk_id,
      (SELECT COUNT(*) FROM likes WHERE file_id=f.id AND file_type='paper' AND vote='up')   AS upvotes,
      (SELECT COUNT(*) FROM likes WHERE file_id=f.id AND file_type='paper' AND vote='down') AS downvotes,
      (SELECT vote     FROM likes WHERE file_id=f.id AND file_type='paper' AND user_id=?)   AS my_vote
    FROM bookmarks b JOIN papers f ON b.file_id=f.id AND b.file_type='paper' WHERE b.user_id=?
    ORDER BY uploaded_at DESC
  `, [uid, uid, uid, uid, uid, uid], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows.map(r => ({ ...r, bookmarked: true, my_vote: r.my_vote || null })));
  });
});

// ════════════════════════════════════════════════════════════════════════════════
//  DOWNLOAD COUNTER
// ════════════════════════════════════════════════════════════════════════════════
app.post("/track-download", requireLogin, (req, res) => {
  const { file_id, file_type } = req.body;
  const uid = req.session.userId;
  db.query("INSERT INTO downloads (user_id, file_id, file_type) VALUES (?,?,?)", [uid, file_id, file_type], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    updateStreak(uid);
    res.json({ success: true });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
//  COMMENTS
// ════════════════════════════════════════════════════════════════════════════════
app.get("/comments/:file_type/:file_id", requireLogin, (req, res) => {
  const { file_type, file_id } = req.params;
  db.query(
    `SELECT c.*, u.name AS user_name FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.file_id=? AND c.file_type=?
     ORDER BY c.created_at ASC LIMIT 200`,
    [file_id, file_type],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows);
    }
  );
});

app.post("/post-comment", requireLogin, (req, res) => {
  const { file_id, file_type, comment, parent_id, socket_id } = req.body;
  const uid = req.session.userId;
  if (!comment || !comment.trim()) return res.status(400).json({ error: "Empty comment" });
  const pid = parent_id ? parseInt(parent_id) : null;

  db.query(
    "INSERT INTO comments (user_id, file_id, file_type, comment, parent_id) VALUES (?,?,?,?,?)",
    [uid, file_id, file_type, comment.trim(), pid],
    (err, result) => {
      if (err) return res.status(500).json({ error: "DB error" });
      const insertId = result.insertId;
      db.query(
        `SELECT c.*, u.name AS user_name FROM comments c JOIN users u ON c.user_id=u.id WHERE c.id=?`,
        [insertId],
        (err2, rows) => {
          if (!err2 && rows.length) {
            const room = `${file_type}-${file_id}`;
            const io   = req.app.get("io");
            io.to(room).emit("new-comment", { ...rows[0], _sender_socket: socket_id || null });
          }
          res.json({ success: true, real_id: insertId });
        }
      );
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════════
//  STUDY PLANNER
// ════════════════════════════════════════════════════════════════════════════════
app.get("/tasks", requireLogin, (req, res) => {
  db.query(
    "SELECT * FROM study_tasks WHERE user_id=? ORDER BY due_date ASC, created_at DESC",
    [req.session.userId],
    (err, rows) => { if (err) return res.status(500).json({ error: "DB error" }); res.json(rows); }
  );
});

app.post("/add-task", requireLogin, (req, res) => {
  const { task, subject, due_date } = req.body;
  if (!task) return res.status(400).json({ error: "Task required" });
  db.query(
    "INSERT INTO study_tasks (user_id, task, subject, due_date, status) VALUES (?,?,?,?,?)",
    [req.session.userId, task, subject||"", due_date||null, "pending"],
    (err) => { if (err) return res.status(500).json({ error: "DB error" }); res.json({ success: true }); }
  );
});

app.post("/update-task", requireLogin, (req, res) => {
  const { id, status } = req.body;
  db.query("UPDATE study_tasks SET status=? WHERE id=? AND user_id=?",
    [status, id, req.session.userId],
    (err) => { if (err) return res.status(500).json({ error: "DB error" }); res.json({ success: true }); }
  );
});

app.delete("/delete-task/:id", requireLogin, (req, res) => {
  db.query("DELETE FROM study_tasks WHERE id=? AND user_id=?",
    [req.params.id, req.session.userId],
    (err) => { if (err) return res.status(500).json({ error: "DB error" }); res.json({ success: true }); }
  );
});

// ════════════════════════════════════════════════════════════════════════════════
//  LEADERBOARD
// ════════════════════════════════════════════════════════════════════════════════
app.get("/leaderboard", requireLogin, (req, res) => {
  const type = req.query.type || "streak";
  let query;
  if (type === "streak") {
    query = `
      SELECT u.id, u.name, u.photo, COALESCE(s.current_streak,0) AS count
      FROM users u LEFT JOIN streaks s ON s.user_id=u.id
      ORDER BY COALESCE(s.current_streak,0) DESC LIMIT 20`;
  } else if (type === "engagement") {
    query = `
      SELECT u.id, u.name, u.photo,
        ((SELECT COUNT(*) FROM notes      WHERE user_id=u.id) +
         (SELECT COUNT(*) FROM ppts       WHERE user_id=u.id) +
         (SELECT COUNT(*) FROM papers     WHERE user_id=u.id) +
         (SELECT COUNT(*) FROM downloads  WHERE user_id=u.id) +
         (SELECT COUNT(*) FROM mcq_scores WHERE user_id=u.id) +
         (SELECT COUNT(*) FROM comments   WHERE user_id=u.id)) AS count
      FROM users u ORDER BY count DESC LIMIT 20`;
  } else {
    query = `
      SELECT u.id, u.name, u.photo,
        ((SELECT COUNT(*) FROM notes  WHERE user_id=u.id) +
         (SELECT COUNT(*) FROM ppts   WHERE user_id=u.id) +
         (SELECT COUNT(*) FROM papers WHERE user_id=u.id)) AS count
      FROM users u ORDER BY count DESC LIMIT 20`;
  }
  db.query(query, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
//  STREAK
// ════════════════════════════════════════════════════════════════════════════════
function updateStreak(userId) {
  const today = new Date().toISOString().split("T")[0];
  db.query("SELECT * FROM streaks WHERE user_id=?", [userId], (err, rows) => {
    if (err) return;
    if (!rows.length) {
      db.query("INSERT INTO streaks (user_id, current_streak, last_active_date) VALUES (?,1,?)", [userId, today]);
      return;
    }
    const rec  = rows[0];
    const last = rec.last_active_date ? new Date(rec.last_active_date).toISOString().split("T")[0] : null;
    if (last === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const newStreak = last === yesterday ? rec.current_streak + 1 : 1;
    db.query("UPDATE streaks SET current_streak=?, last_active_date=? WHERE user_id=?", [newStreak, today, userId]);
  });
}

app.get("/streak", requireLogin, (req, res) => {
  db.query("SELECT current_streak AS streak FROM streaks WHERE user_id=?", [req.session.userId], (err, rows) => {
    if (err || !rows.length) return res.json({ streak: 0 });
    res.json(rows[0]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
//  MCQ GAME
// ════════════════════════════════════════════════════════════════════════════════
app.get("/mcq/:subject", requireLogin, (req, res) => {
  const subject = decodeURIComponent(req.params.subject);
  db.query(
    "SELECT * FROM mcq_questions WHERE subject=? ORDER BY RAND() LIMIT 10",
    [subject],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows);
    }
  );
});

app.post("/save-score", requireLogin, (req, res) => {
  const { subject, score } = req.body;
  db.query(
    "INSERT INTO mcq_scores (user_id, subject, score) VALUES (?,?,?)",
    [req.session.userId, subject, score],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      updateStreak(req.session.userId);
      res.json({ success: true });
    }
  );
});

// ════════════════════════════════════════════════════════════════════════════════
//  AI MCQ GENERATION — Groq
// ════════════════════════════════════════════════════════════════════════════════
const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const pdfParse    = require("pdf-parse");
const mammoth     = require("mammoth");
const officeParser = require("officeparser");

function isImageFile(ext) {
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext);
}

function getMimeType(ext) {
  const map = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",  ".webp": "image/webp",
    ".heic": "image/heic", ".heif": "image/heif",
    ".pdf": "application/pdf"
  };
  return map[ext] || "application/octet-stream";
}

async function extractText(filepath, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const buf = fs.readFileSync(filepath);

  if (isImageFile(ext)) return null; // use vision path

  if (ext === ".pdf") {
    let text = "";
    try { const data = await pdfParse(buf); text = (data.text || "").trim(); } catch(e) {}
    if (text.length < 20) {
      try { const data = await pdfParse(buf, { max: 0 }); text = (data.text || "").trim(); } catch(e) {}
    }
    if (text.length < 20) {
      try {
        const raw = buf.toString("latin1");
        const btMatches = raw.match(/BT[\s\S]*?ET/g) || [];
        const pieces = [];
        for (const block of btMatches) {
          const strMatches = block.match(/\(([^)]+)\)/g) || [];
          for (const s of strMatches) pieces.push(s.slice(1,-1));
        }
        if (pieces.length) text = pieces.join(" ").replace(/\n/g," ").replace(/\\/g,"").trim();
        if (text.length < 20) {
          const tjMatches = raw.match(/\(([^)]{2,})\)\s*Tj/g) || [];
          text = tjMatches.map(m => m.replace(/\)\s*Tj$/,"").slice(1)).join(" ").trim();
        }
      } catch(e) {}
    }
    if (text.length >= 20) return text;
    return "";
  }

  if ([".doc", ".docx"].includes(ext)) {
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  if ([".ppt", ".pptx"].includes(ext)) {
    return await new Promise((resolve) => {
      officeParser.parseOfficeAsync(filepath)
        .then(text => resolve((text || "").trim()))
        .catch(() => resolve(""));
    });
  }

  if ([".txt", ".md"].includes(ext)) return buf.toString("utf8");

  throw new Error("Unsupported file type.");
}

// ── DEBUG: test Groq connectivity ─────────────────────────────────────────────
app.get("/test-gemini", async (req, res) => {
  try {
    const start = Date.now();
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 10
    });
    res.json({ status: "✅ Groq working in " + (Date.now()-start) + "ms", reply: response.choices[0].message.content });
  } catch(e) {
    res.json({ status: "❌ " + e.message });
  }
});

app.post("/generate-mcq", requireLogin, aiUpload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const { subject } = req.body;
  if (!subject) return res.status(400).json({ error: "Subject required" });

  // ── Dynamic question count sent by client (3 per PDF page, clamped 3–30) ───
  const requestedCount = Math.min(30, Math.max(3, parseInt(req.body.count) || 8));
  console.log(`MCQ request: subject="${subject}", count=${requestedCount}`);

  const filePath = req.file.path;
  const origName = req.file.originalname;
  const ext      = path.extname(origName).toLowerCase();
  const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

  // ── Groq caller ──────────────────────────────────────────────────────────────
  const callGroq = async (prompt, imageBase64 = null, imageMime = null) => {
    let userContent;
    if (imageBase64 && imageMime) {
      userContent = [
        { type: "image_url", image_url: { url: "data:" + imageMime + ";base64," + imageBase64 } },
        { type: "text", text: prompt }
      ];
    } else {
      userContent = prompt;
    }
    const model = imageBase64
      ? "meta-llama/llama-4-maverick-17b-128e-instruct"
      : "llama-3.3-70b-versatile";
    console.log("Calling Groq model:", model, "| questions:", requestedCount);
    const response = await Promise.race([
      groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: userContent }],
        temperature: 0.3,
        max_tokens: 4096
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Groq timed out after 120s.")), 120000))
    ]);
    return response.choices[0].message.content;
  };

  try {
    let rawText = null;

    if (!IMAGE_EXTS.includes(ext)) {
      try {
        rawText = await extractText(filePath, origName);
        if (rawText !== null) console.log("Extracted", (rawText||"").length, "chars from", ext);
      } catch(e) {
        console.warn("Text extraction error:", e.message);
        rawText = null;
      }
    }

    const buf = fs.readFileSync(filePath);
    fs.unlink(filePath, () => {});

    let questions;

    // 3 options only (A/B/C) — matches the bridge run game
    const MCQ_FORMAT = `[{"question":"...","option_a":"...","option_b":"...","option_c":"...","correct_option":0}]`;
    const RULES = `STRICT RULES:
- Generate EXACTLY ${requestedCount} questions — no more, no less
- Each question must have exactly 3 options: option_a, option_b, option_c (NO option_d)
- Only one correct answer per question
- correct_option is 0-indexed: 0=option_a, 1=option_b, 2=option_c
- RESPOND WITH ONLY a raw JSON array — no markdown, no code fences, no explanation
REQUIRED FORMAT: ${MCQ_FORMAT}`;

    // ── PATH A: Vision — image files ─────────────────────────────────────────
    if (rawText === null && IMAGE_EXTS.includes(ext)) {
      console.log("Vision path:", origName);
      const mimeType    = getMimeType(ext);
      const imageBase64 = buf.toString("base64");
      const prompt = `You are an expert educator. Study this image of notes carefully.

TASK: Generate exactly ${requestedCount} high-quality multiple choice questions testing deep understanding of the concepts shown.

QUALITY RULES:
- Test actual understanding, not just memory of words
- Each wrong option must be plausible — not obviously wrong
- Cover different concepts across the notes
- University-level academic language
- No trivial or yes/no questions

${RULES}`;
      const raw   = await callGroq(prompt, imageBase64, mimeType);
      const clean = raw.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();
      try { questions = JSON.parse(clean); }
      catch(e) { return res.status(500).json({ error: "AI could not read the image. Please ensure it is clear and well-lit." }); }

    // ── PATH A2: Scanned/image-only PDF ──────────────────────────────────────
    } else if (!rawText || rawText.trim().length < 30) {
      return res.status(400).json({ error: "This PDF has no extractable text. Please upload a JPG or PNG photo of your notes instead." });

    // ── PATH B: Text — typed PDFs, DOCX, PPT, TXT ────────────────────────────
    } else {
      console.log("Text path:", origName);
      // Trim to 8000 chars — enough for large docs without hitting token limits
      const trimmed = rawText.trim().slice(0, 8000);
      const prompt = `You are an expert educator. Read the study notes below and generate exactly ${requestedCount} high-quality multiple choice questions.

QUALITY RULES:
- Test conceptual understanding and application, NOT just definitions
- Each wrong option must be plausible to someone who partially understands the topic
- Cover a variety of different concepts — no repetitive questions
- University-level academic/technical language
- No trivial, obvious, or yes/no questions

${RULES}

STUDY NOTES:
${trimmed}`;
      const raw   = await callGroq(prompt);
      const clean = raw.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();
      try { questions = JSON.parse(clean); }
      catch(e) { return res.status(500).json({ error: "AI returned invalid format. Please try again." }); }
    }

    if (!Array.isArray(questions) || !questions.length)
      return res.status(500).json({ error: "No questions generated. Try a different file." });

    const valid = questions.filter(q =>
      q.question && q.option_a && q.option_b && q.option_c &&
      typeof q.correct_option === "number"
    );
    if (!valid.length)
      return res.status(500).json({ error: "AI generated invalid question format. Try again." });

    const values = valid.map(q => [
      subject,
      q.question,
      q.option_a,
      q.option_b,
      q.option_c,
      q.option_d || "",          // keep column, empty since we use 3 options
      parseInt(q.correct_option)
    ]);

    db.query(
      "INSERT INTO mcq_questions (subject, question, option_a, option_b, option_c, option_d, correct_option) VALUES ?",
      [values],
      (err) => {
        if (err) return res.status(500).json({ error: "DB error saving questions" });
        console.log(`✅ Saved ${valid.length} MCQs for: ${subject}`);
        res.json({ success: true, count: valid.length, questions: valid });
      }
    );

  } catch(e) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error("generate-mcq error:", e.message);
    const isQuota = e.message && (e.message.includes("429") || e.message.includes("quota") || e.message.includes("busy"));
    res.status(500).json({
      error: isQuota
        ? "AI quota exceeded. Please wait 1 minute and try again."
        : (e.message || "Generation failed")
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
//  SEARCH
// ════════════════════════════════════════════════════════════════════════════════
app.get("/search", requireLogin, (req, res) => {
  const q = "%" + (req.query.q || "") + "%";
  db.query(`
    SELECT id, subject, filename, filepath, 'note'  AS type FROM notes  WHERE filename LIKE ? OR subject LIKE ?
    UNION ALL
    SELECT id, subject, filename, filepath, 'ppt'   AS type FROM ppts   WHERE filename LIKE ? OR subject LIKE ?
    UNION ALL
    SELECT id, subject, filename, filepath, 'paper' AS type FROM papers WHERE filename LIKE ? OR subject LIKE ?
    ORDER BY filename ASC LIMIT 30
  `, [q,q, q,q, q,q], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
//  SOCKET.IO + START
// ════════════════════════════════════════════════════════════════════════════════
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io     = new Server(server);

io.on("connection", (socket) => {
  socket.on("join-file", ({ file_id, file_type }) => {
    socket.join(`${file_type}-${file_id}`);
  });
  socket.on("leave-file", ({ file_id, file_type }) => {
    socket.leave(`${file_type}-${file_id}`);
  });
});

app.set("io", io);

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`🚀 NoteX running → ${url}`);
  open(url);
});