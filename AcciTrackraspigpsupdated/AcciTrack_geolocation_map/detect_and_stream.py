"""
AcciTrack — Raspberry Pi 5 camera + crash detection server
detect_and_stream.py

Runs ON the Raspberry Pi 5. Captures video from two CSI cameras via
Picamera2, serves the MJPEG streams + status JSON that templates/camera.html
polls (over your existing Cloudflare Tunnel at cam.accitrack.xyz), runs a
lightweight crash detector, and pushes crash clips to the AcciTrack web app.

── Wiring, at a glance ──────────────────────────────────────────────
  Pi 5 (this script)              Cloudflare Tunnel          Browser (camera.html)
  Flask :5001            ───►   cam.accitrack.xyz   ───►    GET /video_feed/0
    /video_feed/0                                            GET /video_feed/1
    /video_feed/1                                             GET /status   (polled 1x/s)
    /status

  Pi 5 (this script)  ── POST /api/pi-crash-report ──►  Render app (main.py)
    (multipart 'video' file + X-API-KEY header, must match PI_API_KEY
    set in the Render dashboard)

Your cloudflared config.yml (already set up) needs an ingress rule like:
    - hostname: cam.accitrack.xyz
      service: http://localhost:5001

── Setup on the Pi 5 ─────────────────────────────────────────────────
  1. sudo apt install -y python3-picamera2 python3-opencv
     pip install flask requests numpy --break-system-packages
  2. export RENDER_API_URL="https://<your-render-app>.onrender.com"
     export PI_API_KEY="<same value as PI_API_KEY on Render>"
  3. python3 detect_and_stream.py
  4. Confirm cloudflared is running and forwarding cam.accitrack.xyz
     to http://localhost:5001, then open /camera on the dashboard.

── Optional: live GPS on crash reports ────────────────────────────────
  Sends the unit's real coordinates with each crash alert/report, plotted
  on the admin dashboard's map (via report_location_lat/lng). Skip this
  and the report still works, just without a map pin (or with a fixed
  fallback pin if you set PI_FALLBACK_LAT/PI_FALLBACK_LON).
  1. sudo apt install -y gpsd gpsd-clients python3-gps
     sudo systemctl enable gpsd --now
  2. Plug in a USB/UART GPS module (e.g. NEO-6M/NEO-8M), confirm a fix:
     cgps -s
  3. (Optional fallback if GPS isn't wired up / no fix yet)
     export PI_FALLBACK_LAT="14.2117"
     export PI_FALLBACK_LON="121.1652"
"""

import os
import time
import threading
import datetime
import collections

import cv2
import requests
from flask import Flask, Response, jsonify
from picamera2 import Picamera2

# ── Config ────────────────────────────────────────────────────────────
PORT = int(os.environ.get("PI_SERVER_PORT", 5001))
RENDER_API_URL = os.environ.get("RENDER_API_URL", "").rstrip("/")
PI_API_KEY = os.environ.get("PI_API_KEY", "")
LOCATION_LABEL = os.environ.get("PI_LOCATION", "Unknown (Pi camera)")

# FALLBACK coordinates, only used if a live GPS fix isn't available at the
# moment a crash is detected (see get_live_gps() below) - e.g. no GPS
# module wired up, gpsd not running yet, or no satellite lock. If this Pi
# has a GPS module connected via gpsd, you don't need to set these; live
# coordinates are read fresh at crash time instead. Leave unset to send no
# coordinates at all if GPS (live or fallback) isn't available.
PI_FALLBACK_LAT = os.environ.get("PI_FALLBACK_LAT")  # e.g. "14.2117"
PI_FALLBACK_LON = os.environ.get("PI_FALLBACK_LON")  # e.g. "121.1652"

# How long to wait for a fresh GPS fix from gpsd before giving up and
# falling back. Kept short since this runs in the crash path - a crash
# report shouldn't be held up waiting on a GPS module that isn't there.
GPS_FIX_TIMEOUT_SEC = 2.0

FRAME_SIZE = (640, 480)  # (width, height) per camera
JPEG_QUALITY = 80
STREAM_FPS = 15

# Motion-spike crash heuristic — flags a crash as a sudden, large
# frame-to-frame change (impact), not a full object-detection model.
# Tune these two for your camera mounting/angle, or swap check_for_crash()
# out for a real model later without touching anything else in this file.
MOTION_DIFF_THRESHOLD = 45  # 0-255 grayscale diff counted as "changed"
MOTION_AREA_FRACTION = 0.25  # fraction of frame that must change
CRASH_COOLDOWN_SEC = 15  # don't re-fire immediately after a crash

CLIP_SECONDS_BEFORE = 3
CLIP_SECONDS_AFTER = 3
CLIP_DIR = os.path.join(os.path.dirname(__file__), "clips")
os.makedirs(CLIP_DIR, exist_ok=True)

if not RENDER_API_URL or not PI_API_KEY:
    print("[WARN] RENDER_API_URL / PI_API_KEY not set — crash clips will "
          "be saved locally but NOT uploaded to the dashboard.")

# ── Live GPS ─────────────────────────────────────────────────────────
# Reads the CURRENT lat/lon off a GPS receiver connected to this Pi (e.g.
# a UART/USB GPS module such as a NEO-6M/NEO-8M) via gpsd, at the moment a
# crash is detected — not a one-time hardcoded value. This matters for any
# install where the unit could be moved (vehicle-mounted, temporary
# traffic setup, generator cart) — a hardcoded lat/lon would silently
# report the wrong place if the camera ever moves.
#
# One-time setup on the Pi:
#   sudo apt install -y gpsd gpsd-clients python3-gps
#   sudo systemctl enable gpsd --now
# Plug the GPS module into a UART/USB port, then confirm you get a fix:
#   cgps -s
#
# If no GPS module/gpsd is available, this quietly falls back to
# PI_FALLBACK_LAT/PI_FALLBACK_LON, and to no coordinates at all if those
# aren't set either — the crash report/alert still goes out either way,
# just without a map pin.
try:
    from gps import gps as _GPS, WATCH_ENABLE as _WATCH_ENABLE, WATCH_NEWSTYLE as _WATCH_NEWSTYLE
    _gpsd_session = _GPS(mode=_WATCH_ENABLE | _WATCH_NEWSTYLE)
    print("[GPS] Connected to gpsd — live coordinates will be used when available.")
except Exception as e:
    _gpsd_session = None
    print(f"[GPS] gpsd not available ({e}) — will use PI_FALLBACK_LAT/LON if set.")


def get_live_gps():
    """
    Returns (lat, lon) as floats from a live GPS fix if one's available
    right now (waits up to GPS_FIX_TIMEOUT_SEC), otherwise falls back to
    PI_FALLBACK_LAT/PI_FALLBACK_LON, and (None, None) if neither is
    available. Called fresh at crash time (not just once at startup) so
    the reported location reflects where the unit actually is right now.
    """
    if _gpsd_session is not None:
        deadline = time.time() + GPS_FIX_TIMEOUT_SEC
        try:
            while time.time() < deadline:
                if _gpsd_session.waiting(timeout=0.5):
                    report = _gpsd_session.next()
                    if getattr(report, "class", None) == "TPV":
                        lat = getattr(report, "lat", None)
                        lon = getattr(report, "lon", None)
                        if lat is not None and lon is not None:
                            return float(lat), float(lon)
        except Exception as e:
            print(f"[GPS] Live GPS read failed, falling back: {e}")

    if PI_FALLBACK_LAT and PI_FALLBACK_LON:
        try:
            return float(PI_FALLBACK_LAT), float(PI_FALLBACK_LON)
        except ValueError:
            print("[GPS] PI_FALLBACK_LAT/LON are set but not valid numbers — ignoring.")

    return None, None


app = Flask(__name__)

# ── Shared state ────────────────────────────────────────────────────
lock = threading.Lock()
latest_jpeg = {0: None, 1: None}
frame_buffer = {
    0: collections.deque(maxlen=STREAM_FPS * CLIP_SECONDS_BEFORE),
    1: collections.deque(maxlen=STREAM_FPS * CLIP_SECONDS_BEFORE),
}
crash_state = {"crash_detected": False, "crash_log": []}
last_crash_time = 0


def open_camera(cam_index):
    picam = Picamera2(camera_num=cam_index)
    config = picam.create_video_configuration(main={"size": FRAME_SIZE, "format": "RGB888"})
    picam.configure(config)
    picam.start()
    time.sleep(1)  # let exposure/AWB settle
    return picam


def check_for_crash(prev_gray, curr_gray):
    """Cheap motion-spike heuristic. Returns True on a sudden large change."""
    if prev_gray is None:
        return False
    diff = cv2.absdiff(prev_gray, curr_gray)
    changed = (diff > MOTION_DIFF_THRESHOLD).sum()
    return (changed / diff.size) > MOTION_AREA_FRACTION


def send_crash_alert(cam_index, lat, lon):
    """
    Fires the instant a crash is detected, well before the full clip is
    ready — POSTs a small JSON payload to /api/pi-crash-alert so the
    dashboard can flip an "ALERT" indicator immediately, instead of
    waiting for save_clip_and_upload()'s recording + upload to finish
    (which takes several extra seconds). Meant to be run in its own
    thread so a slow/failed request here can never delay frame capture
    or the crash clip pipeline.
    """
    if not RENDER_API_URL or not PI_API_KEY:
        return
    try:
        payload = {
            "location": LOCATION_LABEL,
            "timestamp": datetime.datetime.now().isoformat(),
            "lat": lat,
            "lng": lon,
        }
        resp = requests.post(
            f"{RENDER_API_URL}/api/pi-crash-alert",
            headers={"X-API-KEY": PI_API_KEY},
            json=payload,
            timeout=10,
        )
        print(f"[alert] Crash alert notify status: {resp.status_code} {resp.text[:200]}")
    except requests.RequestException as e:
        print(f"[alert] Crash alert notify failed: {e}")


def save_clip_and_upload(cam_index, lat, lon):
    """Writes buffered pre-crash frames + a few live post-crash frames to
    an mp4, then POSTs it to the Render app's /api/pi-crash-report."""
    now = datetime.datetime.now()
    filename = f"crash_cam{cam_index}_{now.strftime('%Y%m%d%H%M%S')}.mp4"
    path = os.path.join(CLIP_DIR, filename)

    with lock:
        pre_frames = list(frame_buffer[cam_index])

    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), STREAM_FPS, FRAME_SIZE)
    for f in pre_frames:
        writer.write(f)

    end_time = time.time() + CLIP_SECONDS_AFTER
    while time.time() < end_time:
        with lock:
            if frame_buffer[cam_index]:
                writer.write(frame_buffer[cam_index][-1])
        time.sleep(1 / STREAM_FPS)
    writer.release()

    if not RENDER_API_URL or not PI_API_KEY:
        print(f"[crash] Saved clip locally: {path} (upload skipped, no API config)")
        return

    try:
        upload_data = {"location": LOCATION_LABEL}
        if lat is not None and lon is not None:
            upload_data["lat"] = lat
            upload_data["lng"] = lon
        with open(path, "rb") as f:
            resp = requests.post(
                f"{RENDER_API_URL}/api/pi-crash-report",
                headers={"X-API-KEY": PI_API_KEY},
                files={"video": (filename, f, "video/mp4")},
                data=upload_data,
                timeout=30,
            )
        if resp.ok:
            print(f"[crash] Uploaded {filename} -> {resp.json()}")
        else:
            print(f"[crash] Upload failed ({resp.status_code}): {resp.text}")
    except requests.RequestException as e:
        print(f"[crash] Upload error: {e}")


def clear_crash_flag():
    with lock:
        crash_state["crash_detected"] = False


def camera_loop(cam_index):
    global last_crash_time
    picam = open_camera(cam_index)
    prev_gray = None
    frame_interval = 1 / STREAM_FPS

    while True:
        start = time.time()
        frame = picam.capture_array()  # RGB888
        bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        ok, jpeg = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if ok:
            with lock:
                latest_jpeg[cam_index] = jpeg.tobytes()
                frame_buffer[cam_index].append(bgr)

        crashed = check_for_crash(prev_gray, gray)
        prev_gray = gray

        if crashed and (time.time() - last_crash_time) > CRASH_COOLDOWN_SEC:
            last_crash_time = time.time()
            ts = datetime.datetime.now().strftime("%b %d %Y • %I:%M:%S %p")
            with lock:
                crash_state["crash_detected"] = True
                crash_state["crash_log"].append(ts)
            print(f"[crash] Detected on camera {cam_index} at {ts}")

            # Read GPS once here (not inside each thread separately) so
            # the instant alert and the full report agree on the exact
            # same coordinates for this event.
            lat, lon = get_live_gps()

            threading.Thread(target=send_crash_alert, args=(cam_index, lat, lon), daemon=True).start()
            threading.Thread(target=save_clip_and_upload, args=(cam_index, lat, lon), daemon=True).start()
            threading.Timer(6.0, clear_crash_flag).start()

        elapsed = time.time() - start
        if elapsed < frame_interval:
            time.sleep(frame_interval - elapsed)


# ── Flask routes — must match what templates/camera.html requests ───
@app.route("/video_feed/<int:cam_index>")
def video_feed(cam_index):
    if cam_index not in (0, 1):
        return "Unknown camera", 404

    def generate():
        while True:
            with lock:
                jpeg = latest_jpeg[cam_index]
            if jpeg is not None:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n")
            time.sleep(1 / STREAM_FPS)

    return Response(generate(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/status")
def status():
    with lock:
        return jsonify({
            "crash_detected": crash_state["crash_detected"],
            "crash_log": list(crash_state["crash_log"]),
        })


@app.route("/health")
def health():
    with lock:
        streaming = [n for n, j in latest_jpeg.items() if j is not None]
    return jsonify({"ok": True, "cameras_streaming": streaming})


if __name__ == "__main__":
    threading.Thread(target=camera_loop, args=(0,), daemon=True).start()
    threading.Thread(target=camera_loop, args=(1,), daemon=True).start()
    print(f"[AcciTrack-Pi] Serving on 0.0.0.0:{PORT} — point your cloudflared "
          f"ingress for cam.accitrack.xyz at http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, threaded=True)
