# FaceTrack — Facial Recognition Attendance System

## Development Specification v1.0

---

## 1. Project overview

FaceTrack is a desktop-based facial recognition attendance system that uses live camera feeds to identify registered students and automatically mark attendance. It supports multiple camera sources including local webcams, IP/RTSP cameras, and ESP32-CAM modules, with an optional standalone ESP32 + TFT display attendance station.

### Core goals

- Register students with sample face images
- Train a facial recognition model on registered students
- Run live camera feed with real-time face detection and recognition
- Automatically mark attendance when a student is recognized with sufficient confidence
- Provide a manual fallback for uncertain recognitions
- Store attendance records with timestamps and optional face snapshots
- Support filtering, searching, and CSV export of attendance data

---

## 2. Architecture

The application follows a strict frontend/backend separation.

### Backend: Python FastAPI

Handles ALL business logic, ML processing, camera access, and data persistence. The frontend never touches the camera or the face recognition model directly.

### Frontend: Tauri v2 + React + Tailwind CSS

A lightweight desktop shell that renders a React single-page application. Communicates with the backend exclusively via REST API and WebSocket connections to `localhost`.

### Why this split

- The face recognition pipeline (OpenCV, dlib/insightface) is Python-native. Keeping it in FastAPI avoids IPC bridges.
- Tauri uses the system's native webview (~30MB RAM) instead of bundling Chromium (~300MB). This matters because the ML models already consume significant RAM.
- The React frontend is fully decoupled. It could be served as a web app later with zero backend changes.
- Cross-platform: Tauri v2 supports Windows, macOS, and Linux.

### Process model

When the Tauri app launches, it spawns the FastAPI server as a **sidecar process** using Tauri's built-in sidecar command API. The React frontend waits for the backend to be ready (polling a `/health` endpoint), then connects.

```
┌─────────────────────────────────────────────┐
│  Tauri shell                                │
│  ┌───────────────────────────────────────┐  │
│  │  React + Tailwind (WebView)           │  │
│  │  - Live video display                 │  │
│  │  - Student registration forms         │  │
│  │  - Attendance dashboard               │  │
│  │  - Device selector                    │  │
│  └──────────────┬────────────────────────┘  │
│                 │ HTTP + WebSocket           │
│                 │ (localhost:8000)           │
│  ┌──────────────▼────────────────────────┐  │
│  │  FastAPI (Python sidecar)             │  │
│  │  - Camera manager (OpenCV)            │  │
│  │  - Face engine (dlib/insightface)     │  │
│  │  - SQLite database                    │  │
│  │  - ESP32 communication (HTTP/MQTT)    │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## 3. Tech stack

### Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Web framework | FastAPI | REST API + WebSocket endpoints |
| Camera access | OpenCV (`opencv-python`) | Unified camera interface for all sources |
| Face detection | dlib or insightface | Detect face locations in frames |
| Face recognition | `face_recognition` library (dlib-based) or insightface | Generate face encodings and compare |
| Database | SQLite via `aiosqlite` + `databases` or `SQLAlchemy` | Student records, attendance logs |
| Image storage | Local filesystem | Student sample images, attendance snapshots |
| ESP32 communication | HTTP requests or MQTT (`paho-mqtt`) | Send recognition results to ESP32 TFT station |
| Task scheduling | `asyncio` background tasks | Camera frame processing loop |
| Data export | Python `csv` module | CSV attendance export |

### Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Desktop shell | Tauri v2 | Cross-platform native window, sidecar management |
| UI framework | React 18+ | Component-based UI |
| Styling | Tailwind CSS | Modern, responsive design |
| State management | Zustand or React Context | App state (active camera, current view, etc.) |
| HTTP client | Axios or fetch | REST API calls |
| WebSocket client | Native WebSocket API | Live video feed + real-time events |
| Routing | React Router | Navigation between views |
| Tables | TanStack Table | Sortable, filterable attendance table |
| Icons | Lucide React | UI icons |

---

## 4. Camera system

### 4.1 Camera sources

All camera sources are abstracted into a unified interface. From the backend's perspective, every camera is an OpenCV `VideoCapture` object.

| Source | Connection method | OpenCV call |
|--------|------------------|-------------|
| Built-in laptop camera | USB/internal | `cv2.VideoCapture(0)` |
| External USB webcam | USB | `cv2.VideoCapture(1)` or higher index |
| IP camera (RTSP) | Network | `cv2.VideoCapture("rtsp://user:pass@ip:port/stream")` |
| IP camera (HTTP) | Network | `cv2.VideoCapture("http://ip:port/video")` |
| ESP32-CAM | WiFi (MJPEG) | `cv2.VideoCapture("http://192.168.x.x:81/stream")` |

### 4.2 Device discovery

The backend provides a `GET /api/devices` endpoint that returns available cameras.

**Local cameras**: Probe indices 0 through 9 by attempting `cv2.VideoCapture(i)` and checking `cap.isOpened()`. Return the list of working indices with auto-generated names ("Camera 0", "Camera 1", etc.). Try to read the camera name from the OS if possible (platform-specific).

**Network cameras**: These are user-configured. The frontend provides a form where the user enters a stream URL. The backend validates it by attempting to open the stream and read one frame. If successful, the camera is added to the device list and persisted in the database.

**ESP32-CAM**: Treated identically to an IP camera. The user enters the ESP32-CAM's MJPEG stream URL (e.g., `http://192.168.1.100:81/stream`). The ESP32-CAM must be running the standard CameraWebServer Arduino sketch.

### 4.3 Camera manager (backend class)

```python
class CameraManager:
    """Manages active camera connection and frame reading."""

    async def list_devices() -> list[CameraDevice]
    async def connect(device_id: str) -> bool
    async def disconnect() -> None
    async def read_frame() -> np.ndarray | None
    async def add_network_camera(url: str, name: str) -> CameraDevice
    async def remove_network_camera(device_id: str) -> None
    def is_connected() -> bool
    def get_active_device() -> CameraDevice | None
```

### 4.4 Frame pipeline

1. A background asyncio task runs continuously while a camera is connected.
2. It reads frames from OpenCV at the camera's native rate.
3. Every Nth frame (configurable, default N=2), it passes the frame to the face processor.
4. The face processor detects faces, computes encodings, compares against known students.
5. The processor draws bounding boxes, names, and confidence percentages on the frame.
6. The annotated frame is JPEG-encoded, base64-encoded, and pushed to all connected WebSocket clients on `/ws/video-feed`.
7. Recognition events (face matched, unknown face detected) are pushed as JSON to `/ws/events`.

### 4.5 Video streaming to frontend

The backend pushes base64 JPEG frames over WebSocket:

```json
{
  "type": "frame",
  "data": "/9j/4AAQ...<base64 JPEG>...",
  "timestamp": "2025-04-05T10:30:00Z",
  "faces": [
    {
      "bbox": [100, 50, 250, 200],
      "student_id": "STU001",
      "name": "Rahul Kumar",
      "confidence": 0.87
    }
  ]
}
```

The React frontend renders this in an `<img>` element:

```jsx
<img src={`data:image/jpeg;base64,${frameData}`} alt="Camera feed" />
```

This achieves 15-30fps depending on processing load and camera resolution.

---

## 5. Face recognition system

### 5.1 Library choice

Primary: `face_recognition` library (Python, built on dlib). It provides a simple API for face detection, encoding (128-dimensional face descriptors), and comparison. If higher accuracy is needed later, swap to `insightface` (512-dimensional embeddings, better with varied lighting/angles) — the interface stays the same.

### 5.2 Student registration flow

1. User enters student ID, name, and age in the registration form.
2. User captures sample images from the active camera feed. Minimum 4-5 images required, more is better. The UI should guide the user to capture from different angles (front, slight left, slight right).
3. For each captured image, the backend:
   a. Detects exactly one face in the frame. If zero or multiple faces, reject and ask for retry.
   b. Crops the face region with margin.
   c. Saves the cropped image to `data/students/{student_id}/sample_{n}.jpg`.
   d. Computes the 128-dimensional face encoding.
   e. Stores the encoding in memory and persists to database.
4. The student is saved to SQLite with their metadata and encoding data.

### 5.3 Training

Training in this context means computing and storing face encodings for all registered students. Two modes:

**Auto-train on registration**: When a new student is registered and sample images are captured, their encodings are computed immediately and added to the in-memory model. No separate training step needed for the new student.

**Full retrain**: A `POST /api/train` endpoint that recomputes encodings for ALL students from their stored sample images. This is useful when:
- The recognition library is updated.
- Sample images are added or removed.
- The app is restarted and needs to reload encodings into memory.

On startup, the backend loads all stored encodings from the database into memory. The in-memory structure is:

```python
known_encodings: list[np.ndarray]  # 128-d vectors, one per sample image
known_student_ids: list[str]       # Parallel list mapping encoding index to student
known_names: list[str]             # Parallel list of display names
```

### 5.4 Recognition algorithm

For each detected face in a frame:

1. Compute its 128-d encoding.
2. Compare against all known encodings using Euclidean distance.
3. Find the closest match. The `face_recognition` library's `compare_faces` uses a threshold (default 0.6 tolerance — lower is stricter).
4. Compute confidence as `1 - (distance / max_distance)` normalized to 0-100%.
5. If best match confidence >= 75%, classify as recognized.
6. If between 50-74%, classify as uncertain.
7. If below 50%, classify as unknown.

### 5.5 Performance considerations

- **ESP32-CAM**: Lower resolution (640x480) means faces must be closer to the camera for reliable recognition. The backend should accept a configurable minimum face size (in pixels) per device type. For ESP32-CAM, set minimum face width to 80px; for HD webcams, 60px.
- **Frame skip**: Process every 2nd frame by default. Configurable via settings.
- **Encoding cache**: Once computed, face encodings are cached in memory. The comparison step is fast (< 5ms for 100 students).
- **Thread safety**: Camera reading runs in a separate thread. Frame processing runs in an asyncio task. Use `asyncio.to_thread()` for CPU-bound face recognition calls.

---

## 6. Attendance system

### 6.1 Hybrid capture mode

The attendance system operates in a hybrid auto+manual mode:

**Automatic capture** (confidence >= 75%):
- When a face is recognized with >= 75% confidence, the system auto-marks attendance.
- A cooldown period of 30 seconds per student prevents duplicate entries (configurable).
- The frontend shows a green overlay with the student's name and "Attendance Marked" for 3 seconds.
- An optional sound plays on successful marking.

**Manual confirmation** (confidence 50-74%):
- The face is highlighted with an orange/yellow bounding box.
- The frontend shows the best-match student name and confidence.
- A "Confirm" button and "Dismiss" button appear.
- The user can click Confirm to mark attendance, or Dismiss to ignore.
- If no action in 10 seconds, the prompt auto-dismisses.

**Unknown face** (confidence < 50%):
- The face is highlighted with a red bounding box.
- "Unknown" is displayed. No attendance action.

**Manual trigger**: The user can press a keyboard shortcut (spacebar or a dedicated button) to force-capture the current frame and attempt recognition, bypassing the polling interval. Useful for quick one-off checks.

### 6.2 Attendance record schema

Each attendance record contains:

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| student_id | TEXT NOT NULL | Foreign key to students table |
| timestamp | DATETIME NOT NULL | When attendance was marked |
| confidence | REAL | Recognition confidence (0.0 - 1.0) |
| capture_mode | TEXT | "auto" or "manual" |
| device_id | TEXT | Which camera was used |
| snapshot_path | TEXT | Path to the face snapshot image (nullable) |
| session_id | TEXT | Groups attendance records by session |

### 6.3 Face snapshot storage

When attendance is marked, the system saves a cropped face image from that moment to `data/attendance/{date}/{student_id}_{timestamp}.jpg`. This provides an audit trail. The snapshot path is stored in the attendance record.

Storage can be toggled on/off in settings (it's on by default). The frontend displays the snapshot thumbnail in the attendance log.

### 6.4 Attendance sessions

Attendance is grouped by "sessions". A session is created when the user starts an attendance-taking session (e.g., "Morning Class — April 5, 2025"). This allows filtering attendance by class/event. Sessions have a name, start time, end time, and associated camera device.

### 6.5 CSV export

`GET /api/attendance/export?session_id=...&date_from=...&date_to=...&format=csv`

Returns a downloadable CSV with columns: Student ID, Name, Date, Time, Confidence, Capture Mode, Device, Session Name.

---

## 7. Database schema (SQLite)

```sql
CREATE TABLE students (
    id TEXT PRIMARY KEY,           -- User-typed student ID (e.g., "STU001")
    name TEXT NOT NULL,
    age INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sample_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

CREATE TABLE face_encodings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    encoding BLOB NOT NULL,         -- Numpy array serialized as bytes
    sample_image_path TEXT NOT NULL, -- Path to the source image
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cameras (
    id TEXT PRIMARY KEY,            -- "local:0", "local:1", "network:{uuid}"
    name TEXT NOT NULL,
    type TEXT NOT NULL,             -- "local", "ip", "rtsp", "esp32"
    url TEXT,                       -- NULL for local cameras, URL for network
    config JSON,                    -- Device-specific settings (resolution, min_face_size, etc.)
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,            -- UUID
    name TEXT NOT NULL,
    camera_id TEXT REFERENCES cameras(id),
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    status TEXT DEFAULT 'active'    -- "active", "completed"
);

CREATE TABLE attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL REFERENCES students(id),
    session_id TEXT REFERENCES sessions(id),
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confidence REAL,
    capture_mode TEXT NOT NULL,     -- "auto" or "manual"
    device_id TEXT,
    snapshot_path TEXT,
    UNIQUE(student_id, session_id)  -- One attendance per student per session
);

CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_timestamp ON attendance(timestamp);
CREATE INDEX idx_face_encodings_student ON face_encodings(student_id);
```

---

## 8. API endpoints

### Health and config

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check. Returns `{status: "ok"}` |
| GET | `/api/config` | Get current app configuration |
| PUT | `/api/config` | Update configuration settings |

### Devices / cameras

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices` | List all available cameras (local + saved network) |
| POST | `/api/devices` | Add a network camera (body: `{url, name, type}`) |
| DELETE | `/api/devices/{id}` | Remove a saved network camera |
| POST | `/api/devices/{id}/connect` | Set this as the active camera |
| POST | `/api/devices/disconnect` | Disconnect the active camera |
| GET | `/api/devices/active` | Get the currently active camera info |

### Students

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/students` | List all students (supports `?search=`, `?page=`, `?limit=`) |
| GET | `/api/students/{id}` | Get a single student with their sample images |
| POST | `/api/students` | Create a new student (body: `{id, name, age}`) |
| PUT | `/api/students/{id}` | Update student details |
| DELETE | `/api/students/{id}` | Delete a student and their data |
| POST | `/api/students/{id}/samples` | Capture and save a sample image from active camera |
| DELETE | `/api/students/{id}/samples/{sample_id}` | Delete a specific sample image |
| GET | `/api/students/{id}/samples` | List all sample images for a student |

### Training

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/train` | Full retrain on all students |
| GET | `/api/train/status` | Training status (`{status, progress, total}`) |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List all sessions (supports `?date_from=`, `?date_to=`) |
| POST | `/api/sessions` | Start a new attendance session (body: `{name, camera_id}`) |
| PUT | `/api/sessions/{id}` | Update session (e.g., end it) |
| GET | `/api/sessions/{id}` | Get session details with attendance summary |

### Attendance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attendance` | List attendance records (supports filters below) |
| POST | `/api/attendance` | Manually mark attendance (body: `{student_id, session_id}`) |
| DELETE | `/api/attendance/{id}` | Remove an attendance record |
| GET | `/api/attendance/export` | Export filtered attendance as CSV |

**Attendance filters** (query parameters):
- `session_id` — Filter by session
- `student_id` — Filter by student
- `date_from`, `date_to` — Date range
- `capture_mode` — "auto" or "manual"
- `page`, `limit` — Pagination
- `sort_by`, `sort_order` — Sorting

### WebSocket endpoints

| Endpoint | Direction | Description |
|----------|-----------|-------------|
| `/ws/video-feed` | Server → Client | Live annotated video frames as base64 JPEG |
| `/ws/events` | Server → Client | Real-time recognition events as JSON |

**Event types on `/ws/events`**:

```json
{"type": "face_recognized", "student_id": "STU001", "name": "Rahul", "confidence": 0.87, "bbox": [100,50,250,200]}
{"type": "face_uncertain", "student_id": "STU001", "name": "Rahul", "confidence": 0.62, "bbox": [100,50,250,200]}
{"type": "face_unknown", "bbox": [100,50,250,200]}
{"type": "attendance_marked", "student_id": "STU001", "name": "Rahul", "mode": "auto"}
{"type": "camera_disconnected", "device_id": "local:0"}
{"type": "training_progress", "progress": 45, "total": 100}
{"type": "training_complete", "student_count": 25}
```

---

## 9. Frontend views

The React app has the following pages/views, accessible via a sidebar or top navigation.

### 9.1 Dashboard (home)

- Shows overall stats: total students registered, today's attendance count, active session info.
- Quick-start buttons: "Start Attendance Session", "Register Student".
- Recent activity feed showing last 10 attendance records.

### 9.2 Live camera / attendance view

- Large camera preview area displaying the live feed from WebSocket.
- Device selector dropdown at the top (populated from `GET /api/devices`).
- "Add Network Camera" button that opens a modal with URL input.
- Active session indicator with session name and duration.
- Recognition overlay on the video feed showing bounding boxes, names, confidence bars.
- Auto-attendance notifications (green toast: "Rahul Kumar — Present").
- Manual confirmation panel (orange card below video: uncertain match with Confirm/Dismiss buttons).
- Keyboard shortcut indicator (spacebar for manual capture).
- Controls: Start/Stop session, toggle auto-capture on/off, adjust confidence threshold slider.

### 9.3 Student registration

- Form fields: Student ID (text input), Name (text input), Age (number input).
- Live camera preview for capturing sample images.
- "Capture Sample" button that takes a snapshot. Show captured samples as a thumbnail grid.
- Minimum 4 samples required. UI shows progress (e.g., "3/5 samples captured").
- Each thumbnail has a delete button.
- Guidance text: "Look straight", "Turn slightly left", "Turn slightly right".
- "Save Student" button that triggers encoding computation.
- Success state shows the student card with all samples.

### 9.4 Students list

- Searchable, paginated table of all registered students.
- Columns: Student ID, Name, Age, Samples Count, Date Registered, Actions.
- Actions: View/Edit, Delete, Re-capture samples.
- Click a row to see student detail with all sample images.

### 9.5 Attendance history

- Filterable table powered by TanStack Table.
- Filters: Date range picker, Session dropdown, Student search, Capture mode (auto/manual).
- Columns: Student ID, Name, Date, Time, Confidence %, Mode, Session, Snapshot thumbnail.
- Click a snapshot thumbnail to see it full-size.
- "Export CSV" button with current filters applied.
- Summary stats at the top: Total present, Total absent (if session selected), Average confidence.

### 9.6 Training

- Shows training status and last trained timestamp.
- "Retrain All" button with progress bar.
- Per-student encoding status: how many samples, when last trained.
- Warnings for students with fewer than 4 samples.

### 9.7 Settings

- Confidence threshold slider (default 75%, range 50-95%).
- Cooldown period input (default 30 seconds).
- Frame skip rate (process every Nth frame, default 2).
- Snapshot storage toggle (on/off).
- Default camera selection.
- ESP32 TFT station URL configuration.
- Data management: clear all attendance, export full database, import students from CSV.

---

## 10. ESP32 integration

### 10.1 ESP32-CAM (camera module)

The ESP32-CAM runs the standard Arduino CameraWebServer sketch. No custom firmware needed. It serves an MJPEG stream at `http://{esp32_ip}:81/stream`. The FastAPI backend reads this stream via OpenCV just like any other IP camera.

Configuration:
- Resolution: 640x480 recommended (VGA). Higher resolutions cause WiFi lag.
- JPEG quality: 10-15 (lower = faster streaming, sufficient for face recognition).
- The ESP32-CAM's IP address is entered by the user in the device settings.

### 10.2 ESP32 + TFT display (status station)

This is a separate ESP32 dev kit with a 2.4" TFT display, acting as a wall-mounted attendance feedback station. It does NOT do any recognition — it just displays results.

**Communication flow:**
1. ESP32-CAM streams to FastAPI backend.
2. FastAPI recognizes a face.
3. FastAPI sends an HTTP POST to the ESP32 TFT station: `POST http://{esp32_tft_ip}/display`
4. Payload: `{"name": "Rahul Kumar", "student_id": "STU001", "status": "present", "time": "10:30 AM"}`
5. The ESP32 TFT renders the name and status on screen.
6. After 5 seconds, the display returns to a "Ready — show your face" idle screen.

**ESP32 TFT firmware** (separate from this project, but the API contract is defined here):
- Runs a simple HTTP server on port 80.
- `POST /display` — accepts JSON with name, student_id, status, time. Renders on TFT.
- `GET /health` — returns `{status: "ok"}`.
- Connects to the same WiFi network as the main computer.

The FastAPI backend has a configurable `esp32_tft_url` setting. When set, it sends POST requests after each successful attendance marking.

---

## 11. Project structure

```
facetrack/
├── backend/
│   ├── main.py                    # FastAPI app entry point
│   ├── config.py                  # Configuration management
│   ├── requirements.txt
│   ├── database/
│   │   ├── __init__.py
│   │   ├── connection.py          # SQLite connection setup
│   │   ├── models.py              # SQLAlchemy models or raw schemas
│   │   └── migrations.py          # Schema creation/migration
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── devices.py             # Camera/device endpoints
│   │   ├── students.py            # Student CRUD endpoints
│   │   ├── attendance.py          # Attendance endpoints + CSV export
│   │   ├── sessions.py            # Session management
│   │   ├── training.py            # Model training endpoints
│   │   └── websocket.py           # WebSocket handlers
│   ├── services/
│   │   ├── __init__.py
│   │   ├── camera_manager.py      # Camera abstraction layer
│   │   ├── face_engine.py         # Face detection + recognition
│   │   ├── frame_processor.py     # Main processing loop
│   │   ├── attendance_service.py  # Attendance logic + cooldown
│   │   ├── training_service.py    # Encoding computation
│   │   └── esp32_service.py       # ESP32 TFT communication
│   └── data/                      # Created at runtime
│       ├── facetrack.db           # SQLite database
│       ├── students/              # Student sample images
│       │   └── {student_id}/
│       │       ├── sample_001.jpg
│       │       └── sample_002.jpg
│       └── attendance/            # Attendance snapshots
│           └── {date}/
│               └── {student_id}_{timestamp}.jpg
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css              # Tailwind imports
│   │   ├── components/
│   │   │   ├── Layout.jsx         # Sidebar + main content
│   │   │   ├── CameraFeed.jsx     # Live video WebSocket display
│   │   │   ├── DeviceSelector.jsx
│   │   │   ├── RecognitionOverlay.jsx
│   │   │   ├── AttendanceToast.jsx
│   │   │   ├── ManualConfirm.jsx
│   │   │   ├── StudentForm.jsx
│   │   │   ├── SampleCapture.jsx
│   │   │   └── AttendanceTable.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── LiveAttendance.jsx
│   │   │   ├── StudentRegistration.jsx
│   │   │   ├── StudentsList.jsx
│   │   │   ├── AttendanceHistory.jsx
│   │   │   ├── Training.jsx
│   │   │   └── Settings.jsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js    # WebSocket connection management
│   │   │   ├── useCamera.js       # Camera state + device selection
│   │   │   └── useAttendance.js   # Attendance logic + cooldown
│   │   ├── services/
│   │   │   └── api.js             # Axios/fetch wrapper for all API calls
│   │   └── store/
│   │       └── appStore.js        # Zustand global state
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json            # Tauri config (window size, sidecar, etc.)
│   ├── src/
│   │   └── main.rs                # Tauri entry point + sidecar launch
│   └── icons/                     # App icons for all platforms
├── esp32/
│   ├── camera/                    # ESP32-CAM Arduino sketch (reference)
│   │   └── CameraWebServer.ino
│   └── tft_station/               # ESP32 TFT display sketch
│       └── tft_station.ino
├── README.md
├── DEVELOPMENT_SPEC.md            # This file
└── .gitignore
```

---

## 12. Configuration defaults

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8000
  },
  "recognition": {
    "confidence_threshold": 0.75,
    "uncertain_threshold": 0.50,
    "model": "face_recognition",
    "tolerance": 0.6,
    "min_face_width_px": 60
  },
  "attendance": {
    "cooldown_seconds": 30,
    "save_snapshots": true,
    "auto_capture_enabled": true
  },
  "camera": {
    "frame_skip": 2,
    "jpeg_quality": 85,
    "max_resolution": [1280, 720],
    "esp32_min_face_width_px": 80
  },
  "esp32_tft": {
    "enabled": false,
    "url": null
  },
  "storage": {
    "data_dir": "data",
    "max_snapshot_age_days": 90
  }
}
```

---

## 13. Build and run instructions

### Prerequisites

- Python 3.10+
- Node.js 18+
- Rust (for Tauri, install via rustup)
- CMake and C++ compiler (for dlib compilation)
- On Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev` (for Tauri)

### Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
# Start in development mode:
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend setup

```bash
cd frontend
npm install
# Development mode (Vite dev server):
npm run dev
```

### Tauri development

```bash
# From project root:
npm run tauri dev
# This launches both the Vite dev server and the Tauri window.
# The FastAPI backend must be started separately during development.
```

### Production build

```bash
# Build the Python backend as a standalone executable:
pip install pyinstaller
pyinstaller --onefile backend/main.py --name facetrack-server

# Build the Tauri app (bundles frontend + sidecar):
npm run tauri build
# Output: platform-specific installer in src-tauri/target/release/bundle/
```

---

## 14. Development phases

### Phase 1: Backend core (Week 1-2)

- FastAPI project setup with SQLite database.
- Camera manager with local webcam support.
- Face detection and recognition using `face_recognition` library.
- Student CRUD endpoints.
- Sample image capture and encoding computation.
- WebSocket video feed endpoint.

### Phase 2: Frontend shell (Week 2-3)

- Tauri + React + Tailwind project scaffolding.
- Sidebar navigation with all pages.
- Live camera feed component connected to WebSocket.
- Device selector component.
- Student registration form with sample capture.

### Phase 3: Attendance system (Week 3-4)

- Attendance session management.
- Hybrid auto/manual capture mode.
- Recognition overlay on video feed.
- Attendance history page with filters and table.
- CSV export.
- Snapshot storage.

### Phase 4: Network cameras + ESP32 (Week 4-5)

- IP/RTSP camera support.
- ESP32-CAM stream integration.
- ESP32 TFT station communication.
- Network camera management UI.

### Phase 5: Polish and packaging (Week 5-6)

- Settings page with all configuration options.
- Training management UI.
- Dashboard with stats.
- Error handling and edge cases.
- Tauri sidecar configuration for production.
- Cross-platform build and testing.

---

## 15. Key technical decisions summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop framework | Tauri v2 | 10x lighter than Electron, same web UI quality, native webview |
| Backend framework | FastAPI | Async, fast, Python-native ML ecosystem |
| Face recognition | `face_recognition` (dlib) | Simple API, good accuracy, easy to swap to insightface later |
| Database | SQLite | Zero configuration, file-based, sufficient for single-user desktop app |
| Camera abstraction | OpenCV VideoCapture | Unified interface for local, IP, RTSP, and MJPEG cameras |
| Video streaming | WebSocket + base64 JPEG | Works in any browser/webview, no native plugins needed |
| Attendance capture | Hybrid (auto >= 75% + manual fallback) | Best balance of convenience and accuracy |
| ESP32 communication | HTTP POST from backend to ESP32 | Simple, stateless, easy to implement on ESP32 side |
| Frontend state | Zustand | Lightweight, minimal boilerplate, works well with React |
| Styling | Tailwind CSS | Rapid UI development, consistent design, dark mode support |
