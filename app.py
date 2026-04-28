"""
ZERS - Zero-Device Emergency Response System
Flask Backend
"""

from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import sqlite3
import json
import os
import time
import requests
from datetime import datetime
import threading

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# ─── CONFIG ────────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
DB_PATH = ":memory:"  # In-memory SQLite for prototype

# ─── DATABASE ──────────────────────────────────────────────────────────────────
_db_conn = None
_db_lock = threading.Lock()

def get_db():
    global _db_conn
    if _db_conn is None:
        _db_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _db_conn.row_factory = sqlite3.Row
        init_db(_db_conn)
    return _db_conn

def init_db(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emergency_type TEXT,
            severity TEXT,
            reason TEXT,
            suggested_action TEXT,
            safe_place TEXT,
            safe_place_reason TEXT,
            message TEXT,
            lat REAL,
            lng REAL,
            source TEXT,
            status TEXT DEFAULT 'Assigned',
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT,
            source TEXT,
            lat REAL,
            lng REAL,
            created_at TEXT,
            alert_id INTEGER
        );
    """)
    conn.commit()

# ─── AI CLASSIFICATION ──────────────────────────────────────────────────────────
def classify_with_gemini(payload: dict) -> dict:
    """Send data to Gemini for emergency classification + routing decision."""
    prompt = f"""
You are an AI for a Zero-Device Emergency Response System (ZERS).
Analyze the following sensor/message data and classify the emergency.
Also decide the safest evacuation destination type.

Data: {json.dumps(payload)}

Rules for safe_place:
- FIRE       → "open_ground"   (avoid buildings, move to open park/field)
- FLOOD      → "high_ground"   (school or elevated area, avoid low areas)
- EARTHQUAKE → "open_ground"   (away from structures)
- DISTRESS   → "hospital"      (medical help needed)
- NORMAL     → "none"

Respond ONLY with a valid JSON object (no markdown, no extra text):
{{
  "emergency_type": "FIRE|FLOOD|EARTHQUAKE|DISTRESS|NORMAL",
  "severity": "LOW|MEDIUM|HIGH",
  "reason": "short 1-line explanation",
  "suggested_action": "immediate action instruction",
  "safe_place": "open_ground|high_ground|hospital|none",
  "safe_place_reason": "brief reason why this destination is safest"
}}
"""
    if not GEMINI_API_KEY:
        return mock_classify(payload)

    try:
        resp = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=10
        )
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        # Strip markdown fences if present
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip().strip("```").strip()
        return json.loads(text)
    except Exception as e:
        print(f"Gemini error: {e}")
        return mock_classify(payload)

def mock_classify(payload: dict) -> dict:
    """Rule-based fallback classifier with routing decision."""
    msg = str(payload).lower()
    if any(w in msg for w in ["fire","smoke","flame","burn"]) or payload.get("temperature", 0) > 60:
        t = payload.get("temperature", 0)
        sev = "HIGH" if t > 70 else "MEDIUM"
        return {"emergency_type":"FIRE","severity":sev,
                "reason":"High temperature/smoke detected","suggested_action":"Evacuate immediately, move upwind",
                "safe_place":"open_ground","safe_place_reason":"Open ground avoids fire spread and smoke"}
    if any(w in msg for w in ["flood","water level","rain"]) or payload.get("water_level", 0) > 50:
        return {"emergency_type":"FLOOD","severity":"HIGH",
                "reason":"Elevated water level detected","suggested_action":"Move to higher ground immediately",
                "safe_place":"high_ground","safe_place_reason":"Higher elevation avoids rising floodwaters"}
    if any(w in msg for w in ["earthquake","quake","shake","tremor"]) or payload.get("sound", 0) > 110:
        return {"emergency_type":"EARTHQUAKE","severity":"HIGH",
                "reason":"Seismic activity / strong vibration detected","suggested_action":"Drop, cover, hold on. Move to open area.",
                "safe_place":"open_ground","safe_place_reason":"Open ground reduces risk from falling structures"}
    if any(w in msg for w in ["help","sos","hurt","injury","stuck","trapped","danger","emergency"]):
        return {"emergency_type":"DISTRESS","severity":"HIGH",
                "reason":"Distress signal received","suggested_action":"Stay calm. Rescue team has been notified.",
                "safe_place":"hospital","safe_place_reason":"Medical assistance required at nearest hospital"}
    return {"emergency_type":"NORMAL","severity":"LOW",
            "reason":"No emergency detected","suggested_action":"Continue monitoring",
            "safe_place":"none","safe_place_reason":""}

# ─── ROUTES ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/rescue")
def rescue():
    return render_template("rescue.html")

# Analyze sensor data or message
@app.route("/api/analyze", methods=["POST"])
def analyze():
    data = request.get_json()
    source = data.get("source", "sensor")  # sensor | voice | sos
    message = data.get("message", "")
    lat = data.get("lat", 12.9716)
    lng = data.get("lng", 77.5946)

    # Build classification payload
    payload = {**data, "message": message}
    result = classify_with_gemini(payload)

    # Store alert
    with _db_lock:
        db = get_db()
        cur = db.execute(
            "INSERT INTO alerts (emergency_type,severity,reason,suggested_action,safe_place,safe_place_reason,message,lat,lng,source,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (result["emergency_type"], result["severity"], result["reason"],
             result["suggested_action"], result.get("safe_place","none"),
             result.get("safe_place_reason",""), message, lat, lng, source, "Assigned",
             datetime.utcnow().isoformat())
        )
        alert_id = cur.lastrowid
        if message:
            db.execute(
                "INSERT INTO messages (content,source,lat,lng,created_at,alert_id) VALUES (?,?,?,?,?,?)",
                (message, source, lat, lng, datetime.utcnow().isoformat(), alert_id)
            )
        db.commit()

    return jsonify({"alert_id": alert_id, **result})

# Get all alerts
@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    with _db_lock:
        db = get_db()
        rows = db.execute("SELECT * FROM alerts ORDER BY id DESC").fetchall()
    return jsonify([dict(r) for r in rows])

# Get single alert
@app.route("/api/alerts/<int:aid>", methods=["GET"])
def get_alert(aid):
    with _db_lock:
        db = get_db()
        row = db.execute("SELECT * FROM alerts WHERE id=?", (aid,)).fetchone()
    return jsonify(dict(row)) if row else ("Not found", 404)

# Update alert status
@app.route("/api/alerts/<int:aid>/status", methods=["PATCH"])
def update_status(aid):
    status = request.get_json().get("status")
    with _db_lock:
        db = get_db()
        db.execute("UPDATE alerts SET status=? WHERE id=?", (status, aid))
        db.commit()
    return jsonify({"ok": True})

# Get all messages
@app.route("/api/messages", methods=["GET"])
def get_messages():
    with _db_lock:
        db = get_db()
        rows = db.execute("SELECT * FROM messages ORDER BY id DESC").fetchall()
    return jsonify([dict(r) for r in rows])

# Stats for dashboard
@app.route("/api/stats", methods=["GET"])
def get_stats():
    with _db_lock:
        db = get_db()
        total = db.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
        high = db.execute("SELECT COUNT(*) FROM alerts WHERE severity='HIGH'").fetchone()[0]
        active = db.execute("SELECT COUNT(*) FROM alerts WHERE status!='Completed'").fetchone()[0]
        by_type = db.execute("SELECT emergency_type, COUNT(*) as cnt FROM alerts GROUP BY emergency_type").fetchall()
    return jsonify({"total": total, "high": high, "active": active, "by_type": [dict(r) for r in by_type]})

if __name__ == "__main__":
    # Initialize DB on startup
    get_db()
    print("🚨 ZERS Backend running on http://localhost:5000")
    print("   Main UI: http://localhost:5000")
    print("   Rescue Dashboard: http://localhost:5000/rescue")
    app.run(debug=True, port=5000)
