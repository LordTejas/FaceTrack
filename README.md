<div align="center">

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Face-Track-blue?style=for-the-badge&labelColor=0a0a0a&color=3b82f6&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTIgOFY2YTIgMiAwIDAgMSAyLTJoNCIvPjxwYXRoIGQ9Ik0yIDE2djJhMiAyIDAgMCAwIDIgMmg0Ii8+PHBhdGggZD0iTTIyIDhWNmEyIDIgMCAwIDAtMi0yaC00Ii8+PHBhdGggZD0iTTIyIDE2djJhMiAyIDAgMCAxLTIgMmgtNCIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjQiLz48L3N2Zz4=">
  <img alt="FaceTrack" src="https://img.shields.io/badge/Face-Track-blue?style=for-the-badge&labelColor=f0f0f0&color=3b82f6&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTIgOFY2YTIgMiAwIDAgMSAyLTJoNCIvPjxwYXRoIGQ9Ik0yIDE2djJhMiAyIDAgMCAwIDIgMmg0Ii8+PHBhdGggZD0iTTIyIDhWNmEyIDIgMCAwIDAtMi0yaC00Ii8+PHBhdGggZD0iTTIyIDE2djJhMiAyIDAgMCAxLTIgMmgtNCIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjQiLz48L3N2Zz4=">
</picture>

### Facial Recognition Attendance System

A desktop application that uses live camera feeds to identify registered students and automatically mark attendance in real-time.

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=black)](https://tauri.app)
[![Tailwind](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

[Features](#-features) &nbsp;&bull;&nbsp; [Architecture](#-architecture) &nbsp;&bull;&nbsp; [Quick Start](#-quick-start) &nbsp;&bull;&nbsp; [Screenshots](#-screenshots) &nbsp;&bull;&nbsp; [Tech Stack](#-tech-stack) &nbsp;&bull;&nbsp; [API](#-api-reference)

</div>

<br>

## Features

<table>
<tr>
<td width="50%">

### Core
- **Real-time face detection** with color-coded bounding boxes
- **Auto attendance** when confidence >= 75%
- **Manual fallback** for uncertain matches (50-74%)
- **Session management** to group attendance by class/event
- **CSV export** with full filter support

</td>
<td width="50%">

### Advanced
- **Multiple camera sources** (webcam, IP/RTSP, ESP32-CAM)
- **ESP32 TFT display** support for wall-mounted stations
- **Configurable thresholds** (confidence, cooldown, frame skip)
- **Face snapshot audit trail** for every attendance record
- **Dark mode UI** with real-time WebSocket video feed

</td>
</tr>
</table>

<br>

## Architecture

FaceTrack uses a split architecture with a Python backend handling all ML/camera logic and a lightweight Tauri desktop shell for the UI.

```
                          FaceTrack Desktop App
 ┌──────────────────────────────────────────────────────────┐
 │                                                          │
 │   ┌─────────────────────────────────────────────────┐    │
 │   │           Tauri v2  +  React  +  Tailwind       │    │
 │   │                                                 │    │
 │   │   Dashboard  |  Live Feed  |  Registration      │    │
 │   │   Students   |  History    |  Training          │    │
 │   │   Settings   |  Sessions   |  CSV Export        │    │
 │   └────────────────────┬────────────────────────────┘    │
 │                        │                                 │
 │              REST API + WebSocket                        │
 │              (localhost:8000)                             │
 │                        │                                 │
 │   ┌────────────────────▼────────────────────────────┐    │
 │   │              FastAPI  Backend                    │    │
 │   │                                                 │    │
 │   │   ┌──────────┐  ┌───────────┐  ┌───────────┐   │    │
 │   │   │  Camera   │  │   Face    │  │ Attendance│   │    │
 │   │   │  Manager  │  │  Engine   │  │  Service  │   │    │
 │   │   │ (OpenCV)  │  │  (dlib)   │  │           │   │    │
 │   │   └──────────┘  └───────────┘  └───────────┘   │    │
 │   │   ┌──────────┐  ┌───────────┐  ┌───────────┐   │    │
 │   │   │  Frame    │  │  Training │  │  ESP32    │   │    │
 │   │   │ Processor │  │  Service  │  │  Service  │   │    │
 │   │   └──────────┘  └───────────┘  └───────────┘   │    │
 │   │                                                 │    │
 │   │   ┌─────────────────────────────────────────┐   │    │
 │   │   │         SQLite  +  File Storage         │   │    │
 │   │   └─────────────────────────────────────────┘   │    │
 │   └─────────────────────────────────────────────────┘    │
 └──────────────────────────────────────────────────────────┘
```

### How Recognition Works

```
 Camera Frame                Face Detection              Recognition
 ┌──────────┐    ─────>    ┌──────────────┐    ─────>   ┌─────────────┐
 │  ______  │              │  Detect face │              │  Compare    │
 │ /      \ │              │  locations   │              │  128-d      │
 │ | O  O | │              │  (HOG model) │              │  encodings  │
 │ |  __  | │              │              │              │             │
 │ \______/ │              │  Filter by   │              │  Euclidean  │
 │          │              │  min size    │              │  distance   │
 └──────────┘              └──────────────┘              └──────┬──────┘
                                                                │
                    ┌───────────────────────────────────────────┘
                    │
                    ▼
      ┌─────────────────────────────┐
      │                             │
      │   >= 75%  ──> AUTO MARK     │  Green box  + Toast notification
      │                             │
      │   50-74%  ──> ASK USER      │  Orange box + Confirm/Dismiss
      │                             │
      │   < 50%   ──> UNKNOWN       │  Red box    + No action
      │                             │
      └─────────────────────────────┘
```

### Data Flow

```
  ┌─────────┐    MJPEG/USB     ┌──────────┐    base64 JPEG     ┌──────────┐
  │ Camera  │ ───────────────> │ Backend  │ ─── WebSocket ───> │ Frontend │
  │ Source  │                  │ (FastAPI)│                    │ (React)  │
  └─────────┘                  └────┬─────┘                    └──────────┘
   Webcam /                         │
   IP Camera /                      │ Recognition event
   ESP32-CAM                        │
                                    ▼
                             ┌──────────────┐     HTTP POST     ┌──────────┐
                             │   SQLite DB  │                   │  ESP32   │
                             │  (attendance │ ────────────────> │   TFT    │
                             │   records)   │                   │ Display  │
                             └──────────────┘                   └──────────┘
```

<br>

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Python** | 3.10+ | Backend runtime |
| **Node.js** | 18+ | Frontend build tooling |
| **Rust** | Latest stable | Tauri desktop shell |
| **Git** | Any | Version control |

> **Windows users**: You may need Visual Studio Build Tools with C++ workload for compiling `dlib`.

### Installation

```bash
# Clone the repository
git clone https://github.com/LordTejas/FaceTrack.git
cd FaceTrack

# Backend setup
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cd ..

# Frontend setup
cd frontend
npm install
cd ..

# Install Tauri CLI (first time only, takes a few minutes)
cargo install tauri-cli@^2
```

### Running

**Option 1: Double-click** (Windows)
```
start.bat        # Starts backend + desktop app
stop.bat         # Stops everything
```

**Option 2: Manual** (two terminals)

```bash
# Terminal 1 — Backend
cd backend
venv\Scripts\activate
uvicorn main:app --host 127.0.0.1 --port 8000

# Terminal 2 — Desktop App
cargo tauri dev
```

**Option 3: Web only** (no Tauri needed)

```bash
# Terminal 1 — Backend (same as above)
# Terminal 2 — Frontend dev server
cd frontend
npm run dev
# Open http://localhost:5173
```

<br>

## Screenshots

### Dashboard
> Overview with real-time stats, quick actions, and recent activity feed.

### Live Attendance
> Real-time camera feed with face detection overlays, session management, and manual attendance marking.

### Student Registration
> Three-step wizard: student info, face sample capture with guidance, completion.

### Attendance History
> Filterable, sortable table with date range, session, and search filters. CSV export.

### Settings
> Configure recognition thresholds, camera settings, attendance cooldowns, and ESP32 integration.

<br>

## Tech Stack

<table>
<tr>
<th align="left" width="120">Layer</th>
<th align="left">Technology</th>
<th align="left">Why</th>
</tr>
<tr>
<td><strong>Desktop</strong></td>
<td>Tauri v2</td>
<td>10x lighter than Electron (~30MB vs ~300MB RAM), native webview</td>
</tr>
<tr>
<td><strong>Backend</strong></td>
<td>FastAPI</td>
<td>Async Python, native ML ecosystem, WebSocket support</td>
</tr>
<tr>
<td><strong>Face ML</strong></td>
<td>dlib + face_recognition</td>
<td>128-d face encodings, HOG detection, simple API</td>
</tr>
<tr>
<td><strong>Camera</strong></td>
<td>OpenCV</td>
<td>Unified interface for USB, IP, RTSP, MJPEG cameras</td>
</tr>
<tr>
<td><strong>Database</strong></td>
<td>SQLite + aiosqlite</td>
<td>Zero config, file-based, async, perfect for desktop</td>
</tr>
<tr>
<td><strong>Frontend</strong></td>
<td>React 18 + Tailwind CSS</td>
<td>Component-based UI with utility-first styling</td>
</tr>
<tr>
<td><strong>State</strong></td>
<td>Zustand</td>
<td>Lightweight state management, minimal boilerplate</td>
</tr>
<tr>
<td><strong>Streaming</strong></td>
<td>WebSocket + base64 JPEG</td>
<td>Works in any webview, no native plugins needed</td>
</tr>
</table>

<br>

## Project Structure

```
FaceTrack/
├── backend/                    # Python FastAPI server
│   ├── main.py                 # App entry point + lifespan
│   ├── config.py               # Pydantic configuration
│   ├── database/
│   │   ├── connection.py       # SQLite async connection
│   │   ├── models.py           # Pydantic request/response models
│   │   └── migrations.py       # Schema DDL (auto-run on startup)
│   ├── routers/
│   │   ├── devices.py          # Camera CRUD + connect/disconnect
│   │   ├── students.py         # Student CRUD + sample capture
│   │   ├── attendance.py       # Attendance records + CSV export
│   │   ├── sessions.py         # Session management
│   │   ├── training.py         # Model retraining
│   │   ├── config.py           # Runtime config update
│   │   └── websocket.py        # WebSocket video + events
│   ├── services/
│   │   ├── camera_manager.py   # Camera abstraction layer
│   │   ├── face_engine.py      # Face detection + recognition
│   │   ├── frame_processor.py  # Main processing loop
│   │   ├── attendance_service.py
│   │   ├── training_service.py
│   │   └── esp32_service.py    # ESP32 TFT communication
│   └── requirements.txt
├── frontend/                   # React SPA
│   └── src/
│       ├── components/         # Reusable UI components
│       ├── pages/              # 7 route pages
│       ├── hooks/              # WebSocket, camera, attendance
│       ├── services/api.js     # Axios API client
│       └── store/appStore.js   # Zustand global state
├── src-tauri/                  # Tauri desktop shell
│   ├── tauri.conf.json         # Window config, sidecar settings
│   └── src/main.rs             # Rust entry point
├── start.bat                   # One-click start (Windows)
├── stop.bat                    # One-click stop (Windows)
└── DEVELOPMENT_SPEC.md         # Full technical specification
```

<br>

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/devices/` | List all cameras |
| `POST` | `/api/devices/{id}/connect` | Connect to a camera |
| `GET` | `/api/students/` | List students (search, pagination) |
| `POST` | `/api/students/` | Register a new student |
| `POST` | `/api/students/{id}/samples` | Capture face sample |
| `POST` | `/api/sessions/` | Start attendance session |
| `GET` | `/api/attendance/` | Query attendance records |
| `POST` | `/api/attendance/` | Manual attendance mark |
| `GET` | `/api/attendance/export` | Download CSV export |
| `POST` | `/api/train/` | Retrain face model |
| `GET` | `/api/config/` | Get app configuration |
| `PUT` | `/api/config/` | Update configuration |

### WebSocket Streams

| Endpoint | Direction | Payload |
|----------|-----------|---------|
| `/ws/video-feed` | Server -> Client | Base64 JPEG frames + face metadata |
| `/ws/events` | Server -> Client | Recognition events, attendance marks |

<br>

## Database Schema

```sql
students          -- Registered students (id, name, age, sample_count)
face_encodings    -- 128-d face vectors per sample image
cameras           -- Saved network camera configurations
sessions          -- Attendance sessions (name, start/end time)
attendance        -- Records (student, session, confidence, mode, snapshot)
```

<br>

## Configuration

All settings are configurable at runtime via the Settings page or `PUT /api/config/`.

| Setting | Default | Description |
|---------|---------|-------------|
| Confidence threshold | 75% | Auto-mark attendance above this |
| Uncertain threshold | 50% | Show manual confirm between this and confident |
| Cooldown | 30s | Minimum gap between duplicate attendance marks |
| Frame skip | 2 | Process every Nth frame (0 = every frame) |
| JPEG quality | 85% | WebSocket stream quality |
| Save snapshots | On | Store face crops with attendance records |

<br>

## Supported Camera Sources

| Source | Connection |
|--------|-----------|
| Built-in laptop camera | Auto-detected (USB/internal) |
| External USB webcam | Auto-detected by index |
| IP camera (HTTP) | `http://ip:port/video` |
| IP camera (RTSP) | `rtsp://user:pass@ip:port/stream` |
| ESP32-CAM | `http://ip:81/stream` (MJPEG) |

<br>

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

<br>

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

<br>

---

<div align="center">

Built with **Python**, **React**, **Tauri**, and a lot of face encodings.

Made by [LordTejas](https://github.com/LordTejas)

</div>
