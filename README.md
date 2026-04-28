# ZERS — Zero-Device Emergency Response System

A full-stack AI-powered emergency response prototype.

---

## Folder Structure

```
zers/
├── app.py                  ← Flask backend (API + HTML serving)
├── sensor_sim.py           ← Standalone sensor simulation script
├── requirements.txt
├── templates/
│   ├── index.html          ← Main user-facing UI
│   └── rescue.html         ← Rescue team command dashboard
└── static/
    ├── css/
    │   └── style.css
    └── js/
        ├── script.js       ← Main UI logic
        └── rescue.js       ← Rescue dashboard logic
```

---

## Quick Start

### 1. Install Python dependencies

```bash
cd zers
pip install -r requirements.txt
```

### 2. Set your Gemini API Key (optional but recommended)

```bash
# macOS / Linux
export GEMINI_API_KEY="your_key_here"

# Windows CMD
set GEMINI_API_KEY=your_key_here

# Windows PowerShell
$env:GEMINI_API_KEY="your_key_here"
```

> Without a Gemini key, ZERS uses a built-in rule-based classifier as fallback.

### 3. Start the Flask backend

```bash
python app.py
```

You should see:
```
🚨 ZERS Backend running on http://localhost:5000
   Main UI:    http://localhost:5000
   Rescue Dashboard: http://localhost:5000/rescue
```

### 4. Open in browser

| URL | Description |
|-----|-------------|
| http://localhost:5000 | Main user interface (map, SOS, voice) |
| http://localhost:5000/rescue | Rescue team command dashboard |

### 5. (Optional) Run the sensor simulator

In a **second terminal**:

```bash
python sensor_sim.py
```

This sends sensor readings every 15 seconds from 5 simulated nodes across Bengaluru.

---

## API Keys

### Google Maps (for live map)
1. Go to https://console.cloud.google.com
2. Enable **Maps JavaScript API** and **Directions API**
3. Create an API key
4. Enter it in the "Load Map" dialog in the UI

> Without a Maps key, click **Use Demo Mode** to see a canvas-based map.

### Gemini AI
1. Go to https://aistudio.google.com/app/apikey
2. Create a free API key
3. Set it as `GEMINI_API_KEY` environment variable

---

## Features Walkthrough

### Main UI (http://localhost:5000)

| Feature | How to use |
|---------|-----------|
| **Live Sensors** | Auto-updates every 10s. Click "Simulate Sensor Spike" to trigger a disaster event |
| **SOS Button** | Hold for 1.5 seconds to send HIGH priority alert |
| **Voice Message** | Click 🎙 mic, speak your message, click Send |
| **Safe Route** | Select destination → click "Show Route" |
| **Safety Badge** | Top-right shows SAFE/DANGER based on your proximity to alerts |
| **AI Guidance** | Updates automatically with context-aware evacuation advice |

### Rescue Dashboard (http://localhost:5000/rescue)

| Feature | Description |
|---------|-------------|
| Incidents Table | All alerts sorted by severity. Filter by type/severity/status |
| Status Dropdown | Update each incident: Assigned → En Route → Completed |
| Detail Panel | Click any row to see full incident details |
| AI Insights | Gemini-generated reason + suggested action + team guidance |
| Messages Feed | All voice/text messages from users |
| Incident Chart | Live bar chart breakdown by emergency type |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Submit sensor data or message for AI classification |
| GET | `/api/alerts` | Get all alerts |
| GET | `/api/alerts/<id>` | Get single alert |
| PATCH | `/api/alerts/<id>/status` | Update alert status |
| GET | `/api/messages` | Get all messages |
| GET | `/api/stats` | Get summary statistics |

### POST /api/analyze — example payload

```json
{
  "source": "voice",
  "message": "There is fire and smoke near me",
  "lat": 12.9716,
  "lng": 77.5946
}
```

### Response

```json
{
  "alert_id": 1,
  "emergency_type": "FIRE",
  "severity": "HIGH",
  "reason": "Distress message mentions fire and smoke",
  "suggested_action": "Evacuate immediately, move upwind"
}
```

---

## Limitations

- AI classification requires internet (Gemini API)
- Route planning uses Google Maps Directions API (requires key) or simple simulation
- Sensor data is simulated — not from real hardware
- No user identity is stored — only location coordinates
- In-memory SQLite resets on server restart (change `DB_PATH` in `app.py` to a file path to persist)

---

## Persist Data Across Restarts

In `app.py`, change:
```python
DB_PATH = ":memory:"
```
to:
```python
DB_PATH = "zers.db"
```
