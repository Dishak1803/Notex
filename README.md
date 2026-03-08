# NoteX 📚

A study companion platform for students. Upload your notes, slides, and past papers subject-wise, access them anytime, collaborate with classmates, and test your knowledge through an AI-powered quiz game.

## Screenshots

### Login & Register
![Login](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/login.png)
![Register](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/register.png)

### Dashboard & Notes
![Dashboard](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/dashboard.png)
![Notes](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/notes.png)

### Study Planner
![Planner](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/planner.png)

### MCQ Bridge Run Game
![Game Setup](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/game_setup.png)
![Game Running](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/game_running.png)
![Game Panels](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/game_panels.png)

### Leaderboard & Profile
![Leaderboard](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/leaderboard.png)
![Profile](https://github.com/Dishak1803/Notex/raw/main/public/screenshots/profile.png)

## What You Can Do
- 📂 Upload and organize notes, PPTs, PDFs, and past papers by subject
- 👥 View and bookmark notes shared by other students
- 💬 Comment and discuss on uploaded materials
- 🤖 Generate MCQ questions instantly from any file you upload — notes, PDFs, images, DOCX, PPT (powered by Groq + Llama Vision)
- 🎮 Test yourself in a 3D bridge runner game — run into the correct answer lane
- 🏆 Track your score with leaderboards and streaks
- 📅 Plan your study schedule with the built-in study planner
- 🔐 Secure login with OTP-based authentication

## Tech Stack
- Node.js + Express / MySQL / Socket.io / Groq AI (Llama Vision) / PDF.js / Canvas 2D (game engine)

## Setup
1. Clone the repo
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in your credentials
4. Set up the database using `schema.sql`
5. Run `node server.js`
6. Open `http://localhost:3000`

## Made by Disha