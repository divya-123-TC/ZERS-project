"""
ZERS — Sensor Simulation Script
Run this separately to continuously push simulated sensor data to the Flask backend.
Usage: python sensor_sim.py
"""

import requests
import time
import random
import math
import json
from datetime import datetime

BASE_URL = "http://localhost:5000"

# Bengaluru area — simulation bounding box
LAT_RANGE = (12.955, 12.985)
LNG_RANGE = (77.580, 77.615)

# Simulated sensor node locations
SENSOR_NODES = [
    {"id": "node-1", "lat": 12.9716, "lng": 77.5946, "name": "MG Road"},
    {"id": "node-2", "lat": 12.9784, "lng": 77.6408, "name": "Indiranagar"},
    {"id": "node-3", "lat": 12.9352, "lng": 77.6245, "name": "Koramangala"},
    {"id": "node-4", "lat": 12.9719, "lng": 77.5937, "name": "Cubbon Park"},
    {"id": "node-5", "lat": 12.9850, "lng": 77.5533, "name": "Rajajinagar"},
]

# Disaster event presets
DISASTER_PRESETS = {
    "fire": {
        "temperature": lambda: random.uniform(75, 120),
        "smoke":       lambda: random.uniform(400, 950),
        "water_level": lambda: random.uniform(0, 5),
        "sound":       lambda: random.uniform(50, 90),
    },
    "flood": {
        "temperature": lambda: random.uniform(22, 30),
        "smoke":       lambda: random.uniform(5, 15),
        "water_level": lambda: random.uniform(90, 200),
        "sound":       lambda: random.uniform(60, 100),
    },
    "earthquake": {
        "temperature": lambda: random.uniform(20, 32),
        "smoke":       lambda: random.uniform(10, 40),
        "water_level": lambda: random.uniform(5, 25),
        "sound":       lambda: random.uniform(100, 160),
    },
    "normal": {
        "temperature": lambda: random.uniform(25, 36),
        "smoke":       lambda: random.uniform(3, 25),
        "water_level": lambda: random.uniform(2, 12),
        "sound":       lambda: random.uniform(20, 50),
    },
}

def generate_reading(event_type="normal"):
    preset = DISASTER_PRESETS.get(event_type, DISASTER_PRESETS["normal"])
    return {
        "temperature":  round(preset["temperature"](), 1),
        "smoke":        round(preset["smoke"](), 1),
        "water_level":  round(preset["water_level"](), 1),
        "sound":        round(preset["sound"](), 1),
    }

def send_reading(node, reading):
    payload = {
        **reading,
        "source": "sensor",
        "node_id": node["id"],
        "node_name": node["name"],
        "lat": node["lat"] + random.uniform(-0.001, 0.001),
        "lng": node["lng"] + random.uniform(-0.001, 0.001),
    }
    try:
        r = requests.post(f"{BASE_URL}/api/analyze", json=payload, timeout=5)
        result = r.json()
        icon = {"FIRE":"🔥","FLOOD":"🌊","EARTHQUAKE":"🌍","DISTRESS":"🆘","NORMAL":"✅"}.get(result.get("emergency_type","?"),"⚠️")
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {node['name']:15s} → "
              f"{icon} {result.get('emergency_type','?'):10s} | "
              f"{result.get('severity','?'):6s} | {result.get('reason','')[:50]}")
    except requests.exceptions.ConnectionError:
        print(f"[ERROR] Cannot connect to {BASE_URL} — is Flask running?")
    except Exception as e:
        print(f"[ERROR] {e}")

def run_simulation():
    print("=" * 65)
    print("  ZERS Sensor Simulation")
    print(f"  Target: {BASE_URL}")
    print("  Press Ctrl+C to stop")
    print("=" * 65)

    cycle = 0
    while True:
        cycle += 1
        print(f"\n── Cycle {cycle} ──────────────────────────────────────────")

        for node in SENSOR_NODES:
            # Every ~8 cycles inject a disaster event on a random node
            if cycle % 8 == 0 and node["id"] == random.choice([n["id"] for n in SENSOR_NODES]):
                event = random.choice(["fire", "flood", "earthquake"])
                print(f"  ⚡ DISASTER SPIKE: {event.upper()} at {node['name']}")
                reading = generate_reading(event)
            else:
                reading = generate_reading("normal")

            send_reading(node, reading)
            time.sleep(0.5)   # Small gap between nodes

        print(f"  Next cycle in 15s…")
        time.sleep(15)

if __name__ == "__main__":
    run_simulation()
