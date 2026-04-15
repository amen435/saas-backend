from flask import Flask, render_template, request, redirect, url_for, session, jsonify, Response, flash
import base64
import cv2
import numpy as np
from insightface.app import FaceAnalysis
from sklearn.metrics.pairwise import cosine_similarity
# import datetime
import os
import logging
import json
import urllib.request
# from datetime import timedelta
import bcrypt
import re
# import calendar
import smtplib
from email.message import EmailMessage
import time
import requests
import datetime
from datetime import timedelta
import time
import threading
import requests

#---------------------------------------------------------------
THRESHOLD = 0.7
UPLOAD_FRAME_THRESHOLD = 0.5
DEVICE_NAME = "Device-01"
# ---------------------------
# Use data/ directory for JSON storage
REGISTERED_FILE = os.path.join('data', 'registered.json')
ATTENDANCE_FILE = os.path.join('data', 'attendance.json')
FIRED_FILE = os.path.join('data', 'fired.json')
ADMIN_USER = "admin"
ADMIN_PASS = "Admin@1234"
DEFAULT_ATTENDANCE_CAMERA_SOURCE = "esp32"
 
ADMINS_DEPARTMENT = "Admin"
IP_CAMERA_URL = "http://192.168.4.50/stream"  # ESP32-CAM OV2640 MJPEG stream for attendance
esp32_ip = "http://192.168.4.50/time"
ESP32_IP = "192.168.4.50"  

# Setup logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------------------
# JSON Helpers
# ---------------------------
class DateTimeEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, datetime.datetime):
            return o.isoformat()
        if isinstance(o, np.ndarray):
            return o.tolist()
        return super().default(o)
ESP32_IP = os.getenv("ESP32_IP", "192.168.4.1")  # Default ESP32 AP IP
URL = f"http://{ESP32_IP}/time"
ENABLE_ESP32_SYNC = os.getenv("ENABLE_ESP32_SYNC", "0").lower() in ("1", "true", "yes", "on")
FACE_API_KEY = os.getenv("FACE_API_KEY", "").strip()

def send_time():
    """Continuously send current time to ESP32 every minute."""
    last_minute = -1
    while True:
        try:
            now = datetime.datetime.now()
            if now.minute != last_minute:
                time_str = now.strftime("%H:%M:%S")
                response = requests.post(URL, data=time_str, timeout=5)
                
                if response.status_code == 200:
                    print(f"[SYNC OK] Sent time {time_str} | Response: {response.text}")
                else:
                    print(f"[SYNC FAIL] {response.status_code}: {response.text}")
                
                last_minute = now.minute

            time.sleep(1)
        except requests.exceptions.RequestException as e:
            print(f"[SYNC WARN] Connection error: {e}")
            time.sleep(5)
        except Exception as e:
            print(f"[SYNC ERROR] Unexpected: {e}")
            time.sleep(5)



def load_data(file_path, parse_ts=False):
    try:
        if not os.path.exists(file_path):
            logger.warning(f"File {file_path} does not exist, returning empty list")
            return []
            
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Handle empty files
        if not isinstance(data, list):
            logger.warning(f"File {file_path} does not contain a list, returning empty list")
            return []

        # LEGACY FIRED.JSON FIX
        if file_path == FIRED_FILE and data and isinstance(data[0], str):
            logger.warning(f"Converting legacy {file_path} format")
            registered = load_data(REGISTERED_FILE)
            new_data = []
            for student_id in data:
                staff = next((doc for doc in registered if doc["student_id"] == student_id), None)
                new_data.append({
                    "student_id": student_id,
                    "name": staff.get("name", f"Unknown ({student_id})") if staff else f"Unknown ({student_id})",
                    "email": staff.get("email", "") if staff else "",
                    "phone": staff.get("phone", "") if staff else "",
                    "department": staff.get("department", "") if staff else "",
                    "timestamp": datetime.datetime.now().isoformat(),
                    "admin_name": "Unknown",
                    "fired_by": "Unknown",
                    "fired_timestamp": datetime.datetime.now().isoformat()
                })
            save_data(file_path, new_data)
            data = new_data

        # PARSE TIMESTAMP FIELDS
        if parse_ts:
            for doc in data:
                # Parse 'timestamp'
                if "timestamp" in doc and isinstance(doc["timestamp"], str):
                    try:
                        # Handle different timestamp formats
                        ts_str = doc["timestamp"].replace("Z", "+00:00")
                        doc["timestamp"] = datetime.datetime.fromisoformat(ts_str)
                    except Exception as e:
                        logger.warning(f"Failed to parse timestamp {doc['timestamp']}: {e}")
                        # Set to min date if parsing fails
                        doc["timestamp"] = datetime.datetime.min

                # Parse 'fired_timestamp'
                if "fired_timestamp" in doc and isinstance(doc["fired_timestamp"], str):
                    try:
                        ts_str = doc["fired_timestamp"].replace("Z", "+00:00")
                        doc["fired_timestamp"] = datetime.datetime.fromisoformat(ts_str)
                    except Exception as e:
                        logger.warning(f"Failed to parse fired_timestamp {doc['fired_timestamp']}: {e}")
                        doc["fired_timestamp"] = datetime.datetime.min

        return data
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error in {file_path}: {e}")
        return []
    except Exception as e:
        logger.error(f"Failed to load {file_path}: {e}")
        return []
    
def notify_attendance_taken():
    """Send signal to ESP32 to show 'Attendance Taken' overlay"""
    try:
        response = requests.post(
            f"http://{ESP32_IP}/attendance",
            timeout=2
        )
        if response.status_code == 200:
            logger.info("ESP32 notified: Attendance overlay shown")
        else:
            logger.warning(f"ESP32 response: {response.status_code}")
    except requests.exceptions.RequestException as e:
        logger.warning(f"Failed to notify ESP32: {e}")
    
def save_data(file_path, data):
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, cls=DateTimeEncoder, indent=2)
        logger.info(f"Successfully saved data to {file_path}")
    except Exception as e:
        logger.error(f"Failed to save {file_path}: {e}")
        raise

# ---------------------------
# FaceAnalysis
# ---------------------------
try:
    app_face = FaceAnalysis(providers=['CPUExecutionProvider'])
    app_face.prepare(ctx_id=0, det_size=(640, 640))
except Exception as e:
    logger.error(f"FaceAnalysis initialization failed: {e}")
    raise

# ---------------------------
# Flask
# ---------------------------
app = Flask(__name__)
app.secret_key = "supersecret"

@app.template_filter('datetimeformat')
def datetimeformat(value):
    if isinstance(value, datetime.datetime):
        return value.strftime('%Y-%m-%d %H:%M:%S')
    return ''

def require_face_api_key():
    """Allow internal embedding calls without forcing legacy attendance routes to change."""
    if not FACE_API_KEY:
        return None

    provided_key = (request.headers.get("x-api-key") or "").strip()
    if provided_key != FACE_API_KEY:
        return jsonify({"status": "error", "message": "Unauthorized", "error": "Invalid API key"}), 401

    return None

def decode_base64_image(image_base64):
    raw = str(image_base64 or "").strip()
    if not raw:
        raise ValueError("imageBase64 is required")

    if "," in raw:
        raw = raw.split(",", 1)[1].strip()

    try:
        image_bytes = base64.b64decode(raw, validate=True)
    except Exception as error:
        raise ValueError("imageBase64 must be valid base64 data") from error

    image_array = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unable to decode image")

    return raw, image

def extract_single_face_embedding(image_base64):
    normalized_base64, image = decode_base64_image(image_base64)
    faces = app_face.get(image)

    if len(faces) == 0:
        raise ValueError("No face detected in the provided image.")
    if len(faces) > 1:
        raise ValueError("Multiple faces detected. Provide an image with exactly one face.")

    face = faces[0]
    det_score = float(getattr(face, "det_score", 0.0) or 0.0)
    if det_score < 0.7:
        raise ValueError("Face quality is too low. Please upload a clearer image.")

    embedding = getattr(face, "embedding", None)
    if embedding is None:
        raise ValueError("Face embedding could not be generated.")

    embedding_list = np.asarray(embedding, dtype=np.float32).flatten().tolist()
    if len(embedding_list) != 512:
        raise ValueError("Embedding service returned an unexpected embedding length.")

    return normalized_base64, embedding_list, det_score

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "face-service",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    })

@app.route("/generate-embedding", methods=["POST"])
def generate_embedding():
    auth_error = require_face_api_key()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    image_base64 = payload.get("imageBase64")

    try:
        _, embedding, det_score = extract_single_face_embedding(image_base64)
        return jsonify({
            "status": "success",
            "embedding": embedding,
            "detScore": det_score,
        })
    except ValueError as error:
        return jsonify({
            "status": "error",
            "message": str(error),
            "error": str(error),
        }), 400
    except Exception as error:
        logger.exception("Failed to generate embedding")
        return jsonify({
            "status": "error",
            "message": "Failed to generate embedding.",
            "error": str(error),
        }), 500

# ---------------------------
# Helper Functions
# ---------------------------
def load_known_faces():
    known_embeddings = {}
    try:
        fired = load_data(FIRED_FILE)
        fired_ids = set(doc["student_id"] for doc in fired)
        registered = load_data(REGISTERED_FILE)
        for doc in registered:
            if doc["student_id"] not in fired_ids:
                embedding = doc.get("embedding", [])
                if embedding and len(embedding) == 512:
                    embedding_array = np.array(embedding)
                    if embedding_array.size == 512 and embedding_array.shape == (512,):
                        known_embeddings[doc["student_id"]] = {
                            "name": doc["name"],
                            "embedding": embedding_array,
                            "email": doc.get("email", ""),
                            "phone": doc.get("phone", ""),
                            "department": doc.get("department", "")
                        }
                    else:
                        logger.warning(f"Invalid embedding shape for {doc['student_id']}")
                else:
                    logger.warning(f"Missing/invalid embedding for {doc['student_id']}")
        logger.info(f"Loaded {len(known_embeddings)} valid embeddings")
    except Exception as e:
        logger.error(f"Failed to load faces: {e}")
    return known_embeddings

def log_attendance(student_id, name, device=DEVICE_NAME, admin_name=ADMIN_USER):
    try:
        now = datetime.datetime.now()
        attendance = load_data(ATTENDANCE_FILE, parse_ts=True)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        if any(rec["student_id"] == student_id and rec["timestamp"] >= today for rec in attendance):
            logger.info(f"Attendance already logged for {name} (ID: {student_id}) today")
            return False

        record = {
            "student_id": student_id,
            "name": name,
            "timestamp": now,
            "device": device,
            "admin_name": admin_name
        }
        attendance.insert(0, record)
        save_data(ATTENDANCE_FILE, attendance)
        logger.info(f"Attendance logged for {name} (ID: {student_id}) at {now.isoformat()}")

        # THIS IS THE MAGIC LINE
        notify_attendance_taken()  # SEND TO ESP32!

        return True
    except Exception as e:
        logger.error(f"Attendance logging failed for {name} (ID: {student_id}): {e}")
        return False

def validate_password(password):
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number"
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character"
    return True, ""

def validate_email(email):
    email_regex = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    return bool(re.match(email_regex, email))

# ---------------------------
# Globals
# ---------------------------
known_embeddings = load_known_faces()
current_name = "No Face"
is_registration_mode = False
last_unknown_face = None
last_unknown_frame = None

# ---------------------------
# Video Stream
# ---------------------------
def gen_frames_attendance():
    global current_name, known_embeddings, is_registration_mode, last_unknown_face, last_unknown_frame
    while True:
        try:
            with urllib.request.urlopen(IP_CAMERA_URL, timeout=5) as stream:
                bytes_data = b''
                while True:
                    bytes_data += stream.read(1024)
                    a = bytes_data.find(b'\xff\xd8')
                    b = bytes_data.find(b'\xff\xd9')
                    if a != -1 and b != -1:
                        jpg = bytes_data[a:b+2]
                        bytes_data = bytes_data[b+2:]
                        frame = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                        if frame is None:
                            logger.error("Failed to decode frame from ESP32")
                            continue

                        faces = app_face.get(frame)
                        logger.debug(f"Detected {len(faces)} faces in ESP32 frame")

                        if len(faces) == 0:
                            current_name = "No Face"
                            last_unknown_face = None
                            last_unknown_frame = None
                        elif len(faces) > 1:
                            current_name = "Multiple Faces"
                            last_unknown_face = None
                            last_unknown_frame = None
                        else:
                            face = faces[0]
                            if face.det_score < 0.7:
                                logger.debug(f"Low detection score: {face.det_score:.2f}")
                                current_name = "Poor Quality"
                                last_unknown_face = None
                                last_unknown_frame = None
                            else:
                                emb = face.embedding.reshape(1, -1)
                                matched = False
                                for sid, data in known_embeddings.items():
                                    if data["embedding"].size == 0:
                                        logger.warning(f"Empty embedding for {sid}")
                                        continue
                                    sim = cosine_similarity(emb, data["embedding"].reshape(1, -1))[0][0]
                                    logger.debug(f"Comparing with {sid} ({data['name']}): similarity={sim:.4f}, det_score={face.det_score:.4f}")
                                    if sim > THRESHOLD:
                                        current_name = data["name"]
                                        matched = True
                                        if not is_registration_mode:
                                            # Use default admin_name since no request context
                                            if log_attendance(sid, data["name"], DEVICE_NAME, ADMIN_USER):
                                                logger.info(f"Successfully logged attendance for {data['name']} (ID: {sid})")
                                            else:
                                                logger.debug(f"Attendance not logged for {data['name']} (ID: {sid}) - already logged or failed")
                                        break
                                if not matched:
                                    current_name = "Unknown"
                                    last_unknown_face = face
                                    last_unknown_frame = frame.copy()
                                    logger.debug(f"Unknown face detected, det_score={face.det_score:.4f}")

                        for face in faces:
                            x1, y1, x2, y2 = face.bbox.astype(int)
                            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                            cv2.putText(frame, current_name if len(faces) == 1 else "Multiple", (x1, y1 - 10),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

                        ret, buffer = cv2.imencode('.jpg', frame)
                        if not ret:
                            logger.error("Failed to encode frame")
                            continue
                        frame = buffer.tobytes()
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                        break
        except Exception as e:
            logger.error(f"Error fetching frame from ESP32 camera: {e}")
            time.sleep(1)

def open_pc_camera():
    backends = []
    if hasattr(cv2, "CAP_DSHOW"):
        backends.append(("CAP_DSHOW", cv2.CAP_DSHOW))
    if hasattr(cv2, "CAP_MSMF"):
        backends.append(("CAP_MSMF", cv2.CAP_MSMF))
    backends.append(("DEFAULT", None))

    for backend_name, backend in backends:
        try:
            if backend is None:
                cap = cv2.VideoCapture(0)
            else:
                cap = cv2.VideoCapture(0, backend)

            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                logger.warning(f"Could not open PC webcam using {backend_name}")
                continue

            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_FPS, 30)

            if hasattr(cv2, "VideoWriter_fourcc"):
                try:
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
                except Exception:
                    pass

            logger.info(f"Opened PC webcam using {backend_name}")
            return cap
        except Exception as e:
            logger.warning(f"PC webcam open failed using {backend_name}: {e}")

    logger.error("Failed to open PC webcam with all available backends")
    return None

def gen_frames_attendance_pc():
    global current_name, known_embeddings, is_registration_mode, last_unknown_face, last_unknown_frame
    cap = open_pc_camera()
    if cap is None:
        logger.error("Failed to open PC webcam for attendance")
        return

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                logger.error("Failed to capture frame from PC webcam for attendance")
                time.sleep(0.1)
                continue

            faces = app_face.get(frame)
            logger.debug(f"Detected {len(faces)} faces in PC webcam attendance feed")

            if len(faces) == 0:
                current_name = "No Face"
                last_unknown_face = None
                last_unknown_frame = None
            elif len(faces) > 1:
                current_name = "Multiple Faces"
                last_unknown_face = None
                last_unknown_frame = None
            else:
                face = faces[0]
                if face.det_score < 0.7:
                    logger.debug(f"Low detection score: {face.det_score:.2f}")
                    current_name = "Poor Quality"
                    last_unknown_face = None
                    last_unknown_frame = None
                else:
                    emb = face.embedding.reshape(1, -1)
                    matched = False
                    for sid, data in known_embeddings.items():
                        if data["embedding"].size == 0:
                            logger.warning(f"Empty embedding for {sid}")
                            continue
                        sim = cosine_similarity(emb, data["embedding"].reshape(1, -1))[0][0]
                        logger.debug(f"Comparing with {sid} ({data['name']}): similarity={sim:.4f}, det_score={face.det_score:.4f}")
                        if sim > THRESHOLD:
                            current_name = data["name"]
                            matched = True
                            if not is_registration_mode:
                                if log_attendance(sid, data["name"], DEVICE_NAME, ADMIN_USER):
                                    logger.info(f"Successfully logged attendance for {data['name']} (ID: {sid}) using PC camera")
                                else:
                                    logger.debug(f"Attendance not logged for {data['name']} (ID: {sid}) using PC camera")
                            break
                    if not matched:
                        current_name = "Unknown"
                        last_unknown_face = face
                        last_unknown_frame = frame.copy()
                        logger.debug(f"Unknown face detected in PC webcam attendance feed, det_score={face.det_score:.4f}")

            for face in faces:
                x1, y1, x2, y2 = face.bbox.astype(int)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frame, current_name if len(faces) == 1 else "Multiple", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret:
                logger.error("Failed to encode PC webcam attendance frame")
                continue
            frame = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
    except Exception as e:
        logger.error(f"Error in PC webcam attendance stream: {e}")
    finally:
        cap.release()

def gen_frames_registration():
    global current_name, known_embeddings, is_registration_mode, last_unknown_face, last_unknown_frame
    cap = open_pc_camera()
    if cap is None:
        logger.error("Failed to open PC webcam")
        return

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                logger.error("Failed to capture frame from PC webcam")
                time.sleep(0.1)
                continue

            faces = app_face.get(frame)
            logger.debug(f"Detected {len(faces)} faces in PC webcam")

            if len(faces) == 0:
                current_name = "No Face"
                last_unknown_face = None
                last_unknown_frame = None
            elif len(faces) > 1:
                current_name = "Multiple Faces"
                last_unknown_face = None
                last_unknown_frame = None
            else:
                face = faces[0]
                if face.det_score < 0.7:
                    logger.debug(f"Low detection score: {face.det_score:.2f}")
                    current_name = "Poor Quality"
                    last_unknown_face = None
                    last_unknown_frame = None
                else:
                    emb = face.embedding.reshape(1, -1)
                    matched = False
                    for sid, data in known_embeddings.items():
                        if data["embedding"].size == 0:
                            logger.warning(f"Empty embedding for {sid}")
                            continue
                        sim = cosine_similarity(emb, data["embedding"].reshape(1, -1))[0][0]
                        logger.debug(f"Comparing with {sid} ({data['name']}): similarity={sim:.4f}, det_score={face.det_score:.4f}")
                        if sim > THRESHOLD:
                            current_name = data["name"]
                            matched = True
                            break
                    if not matched:
                        current_name = "Unknown"
                        last_unknown_face = face
                        last_unknown_frame = frame.copy()
                        logger.debug(f"Unknown face detected, det_score={face.det_score:.4f}")

            for face in faces:
                x1, y1, x2, y2 = face.bbox.astype(int)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frame, current_name if len(faces) == 1 else "Multiple", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret:
                logger.error("Failed to encode frame")
                continue
            frame = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
    except Exception as e:
        logger.error(f"Error in PC webcam stream: {e}")
    finally:
        cap.release()

# ---------------------------
# Routes
# ---------------------------
def get_attendance_camera_source():
    source = request.args.get("source")
    if source in ("esp32", "pc"):
        session["attendance_camera_source"] = source
        return source

    source = session.get("attendance_camera_source", DEFAULT_ATTENDANCE_CAMERA_SOURCE)
    if source not in ("esp32", "pc"):
        source = DEFAULT_ATTENDANCE_CAMERA_SOURCE
        session["attendance_camera_source"] = source
    return source

@app.route("/set_attendance_camera_source", methods=["POST"])
def set_attendance_camera_source():
    if not session.get("admin"):
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

    source = request.json.get("source") if request.is_json else request.form.get("source")
    if source not in ("esp32", "pc"):
        return jsonify({"status": "error", "message": "Invalid camera source"}), 400

    session["attendance_camera_source"] = source
    return jsonify({"status": "success", "source": source})

@app.route("/video_feed")
def video_feed():
    global is_registration_mode
    is_registration_mode = False
    source = get_attendance_camera_source()

    if source == "pc":
        logger.info("Starting PC webcam feed for attendance")
        return Response(gen_frames_attendance_pc(), mimetype='multipart/x-mixed-replace; boundary=frame')

    logger.info("Starting ESP32 video feed for attendance")
    return Response(gen_frames_attendance(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/register_video_feed")
def register_video_feed():
    global is_registration_mode
    is_registration_mode = True
    logger.info("Starting PC webcam feed for registration")
    return Response(gen_frames_registration(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/stop_camera", methods=["POST"])
def stop_camera():
    logger.info("Camera stop not required for streaming")
    return jsonify({"status": "success", "message": "Camera stop not required"})

@app.route("/")
def login():
    return render_template("login.html")

@app.route("/login", methods=["POST"])
def do_login():
    username = request.form.get("username")
    password = request.form.get("password")
    if not username or not password:
        return render_template("login.html", error="Username and password are required")

    if username == ADMIN_USER and password == ADMIN_PASS:
        session["admin"] = username
        session["admin_name"] = "System Admin"  # Use a meaningful name instead of "admin"
        logger.info(f"Admin {username} logged in")
        return redirect(url_for("home"))

    registered = load_data(REGISTERED_FILE)
    admin = next((doc for doc in registered if doc.get("department") == ADMINS_DEPARTMENT and
                  (doc.get("student_id") == username or doc.get("email") == username)), None)

    if admin and "password" in admin and admin["password"]:
        try:
            if bcrypt.checkpw(password.encode('utf-8'), admin["password"].encode('utf-8')):
                session["admin"] = admin["student_id"]  # Store student_id instead of name
                session["admin_name"] = admin["name"]  # Store display name
                logger.info(f"Admin {admin['name']} logged in")
                return redirect(url_for("home"))
        except Exception as e:
            logger.error(f"Password verification failed for {username}: {e}")

    logger.warning(f"Invalid login attempt for {username}")
    return render_template("login.html", error="Invalid username or password")

@app.route("/home")
def home():
    if not session.get("admin"):
        logger.warning("Unauthorized access to home page")
        return redirect(url_for("login"))

    registered = load_data(REGISTERED_FILE, parse_ts=True)
    fired = load_data(FIRED_FILE, parse_ts=True)
    attendance_data = load_data(ATTENDANCE_FILE, parse_ts=True)
    today = datetime.datetime.now().date()
    start = datetime.datetime.combine(today, datetime.time(0, 0, 0))
    end = datetime.datetime.combine(today, datetime.time(23, 59, 59))

    fired_ids = set(doc["student_id"] for doc in fired)
    total_registered = len([doc for doc in registered if doc["student_id"] not in fired_ids])

    present_ids = set(rec["student_id"] for rec in attendance_data
                     if start <= rec["timestamp"] <= end and rec["student_id"] not in fired_ids)
    present_today = len(present_ids)

    absent_today = total_registered - present_today

    today_logins = [rec["timestamp"] for rec in attendance_data
                    if start <= rec["timestamp"] <= end and rec["student_id"] not in fired_ids]
    avg_login_time = "N/A"
    if today_logins:
        avg_seconds = sum((t.hour * 3600 + t.minute * 60 + t.second) for t in today_logins) // len(today_logins)
        hours, remainder = divmod(avg_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        avg_login_time = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

    total_fired = len(fired)

    notifications = 0
    for student in [doc for doc in registered if doc["student_id"] not in fired_ids]:
        streak = 0
        for i in range(3):
            day = today - timedelta(days=i)
            count = sum(1 for rec in attendance_data
                       if rec["student_id"] == student["student_id"] and rec["timestamp"].date() == day)
            if count == 0:
                streak += 1
        if streak >= 3:
            notifications += 1

    stats = {
        "total_registered": total_registered,
        "present_today": present_today,
        "absent_today": absent_today,
        "avg_login_time": avg_login_time,
        "total_fired": total_fired,
        "notifications": notifications
    }

    logger.info(f"Home page loaded with stats: {stats}")
    return render_template("home.html", stats=stats)

@app.route("/register_page")
def register_page():
    if not session.get("admin"):
        logger.warning("Unauthorized access to register page")
        return redirect(url_for("login"))
    return render_template("index.html")

@app.route("/logout")
def logout():
    admin = session.get("admin", "Unknown")
    session.pop("admin", None)
    logger.info(f"Admin {admin} logged out")
    return redirect(url_for("login"))

@app.route("/admin_register_page")
def admin_register_page():
    if not session.get("admin"):
        logger.warning("Unauthorized access to admin register page")
        return redirect(url_for("login"))
    return render_template("admin_register.html")

@app.route("/recognize_status")
def recognize_status():
    return jsonify({"name": current_name})

@app.route("/register_unknown", methods=["POST"])
def register_unknown():
    global known_embeddings, last_unknown_face, last_unknown_frame
    
    # Check if it's FormData (file upload) or JSON
    if request.files:
        # Handle FormData with image upload
        return register_unknown_with_image()
    else:
        # Handle JSON data (original method)
        return register_unknown_json()

def register_unknown_json():
    global known_embeddings, last_unknown_face, last_unknown_frame
    data = request.json
    student_id = data.get("student_id")
    name = data.get("name")
    email = data.get("email")
    phone = data.get("phone")
    department = data.get("department")

    if not all([student_id, name, email, phone, department]):
        logger.error("Missing required fields for registration")
        return jsonify({"status": "error", "message": "All fields are required"}), 400

    if not validate_email(email):
        logger.error(f"Invalid email format: {email}")
        return jsonify({"status": "error", "message": "Invalid email address"}), 400

    if last_unknown_face is None or last_unknown_frame is None:
        logger.error("No unknown face detected for registration")
        return jsonify({"status": "error", "message": "No unknown face detected. Ensure a single face is visible and try again."}), 400

    if last_unknown_face.det_score < 0.7:
        logger.error(f"Poor image quality: det_score={last_unknown_face.det_score:.2f}")
        return jsonify({"status": "error", "message": f"Poor image quality (det_score: {last_unknown_face.det_score:.2f}). Ensure good lighting and clear face."}), 400

    return process_registration(student_id, name, email, phone, department, last_unknown_face.embedding.tolist(), last_unknown_frame)

def register_unknown_with_image():
    global known_embeddings
    
    # Get form data
    student_id = request.form.get("student_id")
    name = request.form.get("name")
    email = request.form.get("email")
    phone = request.form.get("phone")
    department = request.form.get("department")
    password = request.form.get("password")  # For admin verification
    
    if not all([student_id, name, email, phone, department, password]):
        logger.error("Missing required fields for registration")
        return jsonify({"status": "error", "message": "All fields are required"}), 400

    if not validate_email(email):
        logger.error(f"Invalid email format: {email}")
        return jsonify({"status": "error", "message": "Invalid email address"}), 400

    # Verify admin password
    registered = load_data(REGISTERED_FILE)
    admin = None
    if password == ADMIN_PASS:
        admin = {"name": ADMIN_USER}
    else:
        admin = next((doc for doc in registered if doc.get("department") == ADMINS_DEPARTMENT and 
                      bcrypt.checkpw(password.encode('utf-8'), doc.get("password", "").encode('utf-8'))), None)
    
    if not admin:
        return jsonify({"status": "error", "message": "Invalid admin password"}), 401

    # Process uploaded image
    if 'photo' not in request.files:
        logger.error("No photo uploaded")
        return jsonify({"status": "error", "message": "No image captured"}), 400
    
    photo = request.files['photo']
    if photo.filename == '':
        logger.error("No photo selected")
        return jsonify({"status": "error", "message": "No image captured"}), 400

    try:
        # Read and process the image
        img_array = np.frombuffer(photo.read(), np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is None:
            logger.error("Failed to decode uploaded image")
            return jsonify({"status": "error", "message": "Failed to process image"}), 400
        
        # Detect faces in the uploaded image
        faces = app_face.get(img)
        if len(faces) != 1:
            logger.error(f"Detected {len(faces)} faces in uploaded image")
            return jsonify({"status": "error", "message": f"Detected {len(faces)} faces. Please ensure only one face is visible."}), 400
        
        face = faces[0]
        if face.det_score < 0.7:
            logger.error(f"Poor image quality: det_score={face.det_score:.2f}")
            return jsonify({"status": "error", "message": f"Poor image quality (det_score: {face.det_score:.2f}). Ensure good lighting and clear face."}), 400

        # Check if face already exists
        emb = face.embedding.reshape(1, -1)
        for sid, data in known_embeddings.items():
            similarity = cosine_similarity(emb, data["embedding"].reshape(1, -1))[0][0]
            if similarity > THRESHOLD:
                logger.error(f"Face already registered as {data['name']}")
                return jsonify({"status": "error", "message": f"Face already registered as {data['name']}"}), 400

        # Process registration with the uploaded image
        return process_registration(student_id, name, email, phone, department, face.embedding.tolist(), img)
        
    except Exception as e:
        logger.error(f"Error processing uploaded image: {e}")
        return jsonify({"status": "error", "message": f"Error processing image: {str(e)}"}), 500
    


def process_registration(student_id, name, email, phone, department, embedding, image_frame):
    global known_embeddings
    
    registered = load_data(REGISTERED_FILE)
    
    # Check for duplicate student ID
    if next((doc for doc in registered if doc["student_id"] == student_id), None):
        logger.error(f"Student ID {student_id} already exists")
        return jsonify({"status": "error", "message": f"Student ID {student_id} already registered"}), 400

    # Check for duplicate email
    if next((doc for doc in registered if doc.get("email") == email), None):
        logger.error(f"Email {email} already exists")
        return jsonify({"status": "error", "message": f"Email {email} already registered"}), 400

    try:
        # Save image
        os.makedirs('static/images', exist_ok=True)
        image_path = f'static/images/{student_id}.jpg'
        cv2.imwrite(image_path, image_frame)
        logger.info(f"Image saved for {student_id}")
    except Exception as e:
        logger.error(f"Image save failed for {student_id}: {e}")
        return jsonify({"status": "error", "message": "Failed to save image due to server error"}), 500

    try:
        # Create and save registration record
        doc = {
            "student_id": student_id,
            "name": name,
            "embedding": embedding,
            "email": email,
            "phone": phone,
            "department": department,
            "timestamp": datetime.datetime.now(),
            "admin_name": session.get("admin", ADMIN_USER)
        }
        registered.append(doc)
        save_data(REGISTERED_FILE, registered)
        logger.info(f"Registered staff {name} (ID: {student_id})")
    except Exception as e:
        logger.error(f"Save failed for {student_id}: {e}")
        return jsonify({"status": "error", "message": "Failed to save due to server error"}), 500

    # Reload known faces
    known_embeddings = load_known_faces()
    return jsonify({"status": "success", "message": f"Staff {name} registered successfully!"})

@app.route("/admin_register", methods=["POST"])
def admin_register():
    global known_embeddings, last_unknown_face, last_unknown_frame
    
    # Check if it's FormData (file upload) or JSON
    if request.files:
        # Handle FormData with image upload
        return admin_register_with_image()
    else:
        # Handle JSON data (original method)
        return admin_register_json()

def admin_register_json():
    global known_embeddings, last_unknown_face, last_unknown_frame
    data = request.json
    logger.info(f"Received admin register payload: {data}")
    admin_id = data.get("admin_id")
    name = data.get("name")
    email = data.get("email")
    phone = data.get("phone")
    password = data.get("password")
    admin_confirmation_password = data.get("admin_confirmation_password")

    if not all([admin_id, name, email, phone, password, admin_confirmation_password]):
        logger.error("Missing required fields in admin registration")
        return jsonify({"status": "error", "message": "All fields (Admin ID, Name, Email, Phone, Password, Admin Confirmation Password) are required"}), 400

    if not validate_email(email):
        logger.error(f"Invalid email format: {email}")
        return jsonify({"status": "error", "message": "Invalid email address"}), 400

    phone_regex = r'^\+251\d{9}$'
    if not re.match(phone_regex, phone):
        logger.error(f"Invalid phone format: {phone}")
        return jsonify({"status": "error", "message": "Phone number must be in format +2519xxxxxxxx"}), 400

    is_valid, password_error = validate_password(password)
    if not is_valid:
        logger.error(f"Password validation failed: {password_error}")
        return jsonify({"status": "error", "message": password_error}), 400

    # Verify admin confirmation password
    registered = load_data(REGISTERED_FILE)
    admin = None
    if admin_confirmation_password == ADMIN_PASS:
        admin = {"name": ADMIN_USER}
    else:
        admin = next((doc for doc in registered if doc.get("department") == ADMINS_DEPARTMENT and 
                      bcrypt.checkpw(admin_confirmation_password.encode('utf-8'), doc.get("password", "").encode('utf-8'))), None)
    
    if not admin:
        return jsonify({"status": "error", "message": "Invalid admin confirmation password"}), 401

    if last_unknown_face is None or last_unknown_frame is None:
        logger.error("No unknown face detected for admin registration")
        return jsonify({"status": "error", "message": "No unknown face detected. Ensure a single face is visible and try again."}), 400

    if last_unknown_face.det_score < 0.7:
        logger.error(f"Poor image quality: det_score={last_unknown_face.det_score:.2f}")
        return jsonify({"status": "error", "message": f"Poor image quality (det_score: {last_unknown_face.det_score:.2f}). Ensure good lighting and clear face."}), 400

    return process_admin_registration(admin_id, name, email, phone, password, last_unknown_face.embedding.tolist(), last_unknown_frame, admin["name"])

def admin_register_with_image():
    global known_embeddings
    
    # Get form data
    admin_id = request.form.get("admin_id")
    name = request.form.get("name")
    email = request.form.get("email")
    phone = request.form.get("phone")
    password = request.form.get("password")
    admin_confirmation_password = request.form.get("admin_confirmation_password")

    if not all([admin_id, name, email, phone, password, admin_confirmation_password]):
        logger.error("Missing required fields in admin registration")
        return jsonify({"status": "error", "message": "All fields are required"}), 400

    if not validate_email(email):
        logger.error(f"Invalid email format: {email}")
        return jsonify({"status": "error", "message": "Invalid email address"}), 400

    phone_regex = r'^\+251\d{9}$'
    if not re.match(phone_regex, phone):
        logger.error(f"Invalid phone format: {phone}")
        return jsonify({"status": "error", "message": "Phone number must be in format +2519xxxxxxxx"}), 400

    is_valid, password_error = validate_password(password)
    if not is_valid:
        logger.error(f"Password validation failed: {password_error}")
        return jsonify({"status": "error", "message": password_error}), 400

    # Verify admin confirmation password
    registered = load_data(REGISTERED_FILE)
    admin = None
    if admin_confirmation_password == ADMIN_PASS:
        admin = {"name": ADMIN_USER}
    else:
        admin = next((doc for doc in registered if doc.get("department") == ADMINS_DEPARTMENT and 
                      bcrypt.checkpw(admin_confirmation_password.encode('utf-8'), doc.get("password", "").encode('utf-8'))), None)
    
    if not admin:
        return jsonify({"status": "error", "message": "Invalid admin confirmation password"}), 401

    # Process uploaded image
    if 'photo' not in request.files:
        logger.error("No photo uploaded")
        return jsonify({"status": "error", "message": "No image captured"}), 400
    
    photo = request.files['photo']
    if photo.filename == '':
        logger.error("No photo selected")
        return jsonify({"status": "error", "message": "No image captured"}), 400

    try:
        # Read and process the image
        img_array = np.frombuffer(photo.read(), np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is None:
            logger.error("Failed to decode uploaded image")
            return jsonify({"status": "error", "message": "Failed to process image"}), 400
        
        # Detect faces in the uploaded image
        faces = app_face.get(img)
        if len(faces) != 1:
            logger.error(f"Detected {len(faces)} faces in uploaded image")
            return jsonify({"status": "error", "message": f"Detected {len(faces)} faces. Please ensure only one face is visible."}), 400
        
        face = faces[0]
        if face.det_score < 0.7:
            logger.error(f"Poor image quality: det_score={face.det_score:.2f}")
            return jsonify({"status": "error", "message": f"Poor image quality (det_score: {face.det_score:.2f}). Ensure good lighting and clear face."}), 400

        # Check if face already exists
        emb = face.embedding.reshape(1, -1)
        for sid, data in known_embeddings.items():
            similarity = cosine_similarity(emb, data["embedding"].reshape(1, -1))[0][0]
            if similarity > THRESHOLD:
                logger.error(f"Face already registered as {data['name']}")
                return jsonify({"status": "error", "message": f"Face already registered as {data['name']}"}), 400

        # Process admin registration with the uploaded image
        return process_admin_registration(admin_id, name, email, phone, password, face.embedding.tolist(), img, admin["name"])
        
    except Exception as e:
        logger.error(f"Error processing uploaded image: {e}")
        return jsonify({"status": "error", "message": f"Error processing image: {str(e)}"}), 500

def process_admin_registration(admin_id, name, email, phone, password, embedding, image_frame, admin_name):
    global known_embeddings
    
    registered = load_data(REGISTERED_FILE)
    
    # Check for duplicate admin ID
    if next((doc for doc in registered if doc["student_id"] == admin_id), None):
        logger.error(f"Admin ID {admin_id} already exists")
        return jsonify({"status": "error", "message": f"Admin ID {admin_id} already registered"}), 400

    # Check for duplicate email
    if next((doc for doc in registered if doc.get("email") == email), None):
        logger.error(f"Email {email} already exists")
        return jsonify({"status": "error", "message": f"Email {email} already registered"}), 400

    # Check for duplicate admin name
    if next((doc for doc in registered if doc.get("name") == name and doc.get("department") == ADMINS_DEPARTMENT), None):
        logger.error(f"Admin name {name} already exists")
        return jsonify({"status": "error", "message": f"Admin name {name} already registered"}), 400

    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    try:
        # Save image
        os.makedirs('static/images', exist_ok=True)
        image_path = f'static/images/{admin_id}.jpg'
        cv2.imwrite(image_path, image_frame)
        logger.info(f"Image saved for {admin_id}")
    except Exception as e:
        logger.error(f"Image save failed: {e}")
        return jsonify({"status": "error", "message": "Failed to save image due to server error"}), 500

    try:
        # Create and save admin registration record
        doc = {
            "student_id": admin_id,
            "name": name,
            "embedding": embedding,
            "email": email,
            "phone": phone,
            "department": ADMINS_DEPARTMENT,
            "timestamp": datetime.datetime.now(),
            "admin_name": admin_name,
            "password": hashed_password
        }
        registered.append(doc)
        save_data(REGISTERED_FILE, registered)
        logger.info(f"Registered admin {name} (ID: {admin_id})")
    except Exception as e:
        logger.error(f"Save failed for {admin_id}: {e}")
        return jsonify({"status": "error", "message": "Failed to save due to server error"}), 500

    # Reload known faces
    known_embeddings = load_known_faces()
    return jsonify({"status": "success", "message": f"Admin {name} registered successfully!"})

@app.route("/send_alert", methods=["POST"])
def send_alert():
    email = request.form["email"]
    name = request.form["name"]

    try:
        sender_email = "tarikushemsu3@gmail.com"
        sender_password = "kztm conz kqxe tctz"  # App password
        subject = "Attendance Alert"

        msg = EmailMessage()
        msg['From'] = sender_email
        msg['To'] = email
        msg['Subject'] = subject
        msg.set_content(f"""
Dear {name},

Our system detected that you have been absent for 3 or more consecutive days.
Please contact your department immediately.

Regards,
Attendance Admin
""")

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(msg)

        logger.info(f"Alert email sent to {name} ({email})")
        return redirect(url_for("notifications"))
    except Exception as e:
        logger.error(f"Failed to send email to {name} ({email}): {e}")
        return redirect(url_for("notifications"))

@app.route("/attendance", methods=["GET", "POST"])
def attendance():
    if not session.get("admin"):
        logger.warning("Unauthorized access to attendance page")
        return redirect(url_for("login"))

    today = datetime.datetime.now().date()
    selected_year = request.form.get("year", today.year, type=int)
    selected_month = request.form.get("month", today.month, type=int)
    selected_day = request.form.get("day", today.day, type=int)

    start = datetime.datetime(selected_year, selected_month, selected_day, 0, 0, 0)
    end = datetime.datetime(selected_year, selected_month, selected_day, 23, 59, 59)

    fired = load_data(FIRED_FILE, parse_ts=True)
    fired_ids = set(doc["student_id"] for doc in fired)
    attendance_data = load_data(ATTENDANCE_FILE, parse_ts=True)
    attendance_records = [rec for rec in attendance_data if start <= rec["timestamp"] <= end and rec["student_id"] not in fired_ids]

    present = []
    late = []
    present_ids = set()
    late_threshold = datetime.datetime(selected_year, selected_month, selected_day, 9, 30, 0)

    registered = load_data(REGISTERED_FILE, parse_ts=True)

    for rec in attendance_records:
        student = next((doc for doc in registered if doc["student_id"] == rec["student_id"]), None)
        if student:
            student = student.copy()
            student["timestamp"] = rec["timestamp"]
            student["admin_name"] = rec.get("admin_name", ADMIN_USER)
            if rec["timestamp"] > late_threshold:
                late.append(student)
            else:
                present.append(student)
            present_ids.add(rec["student_id"])

    absent = [doc for doc in registered if doc["student_id"] not in present_ids and doc["student_id"] not in fired_ids]

    all_attendance = sorted(attendance_data, key=lambda x: x["timestamp"])
    years = set()
    months = {}
    for rec in all_attendance:
        ts = rec["timestamp"]
        years.add(ts.year)
        months.setdefault(ts.year, set()).add(ts.month)

    years = sorted(years)
    for y in months:
        months[y] = sorted(months[y])

    logger.info(f"Attendance page loaded for {selected_year}-{selected_month}-{selected_day}: {len(present)} present, {len(late)} late, {len(absent)} absent")
    camera_source = session.get("attendance_camera_source", DEFAULT_ATTENDANCE_CAMERA_SOURCE)
    if camera_source not in ("esp32", "pc"):
        camera_source = DEFAULT_ATTENDANCE_CAMERA_SOURCE
        session["attendance_camera_source"] = camera_source

    return render_template("attendance.html",
                           present=present,
                           late=late,
                           absent=absent,
                           fired=fired,
                           years=years,
                           months=months,
                           camera_source=camera_source,
                           selected_year=selected_year,
                           selected_month=selected_month,
                           selected_day=selected_day)

@app.route("/attendance_data", methods=["GET"])
def attendance_data():
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    day = request.args.get("day", type=int)

    if not all([year, month, day]):
        today = datetime.datetime.now().date()
        year = year or today.year
        month = month or today.month
        day = day or today.day

    start = datetime.datetime(year, month, day, 0, 0, 0)
    end = datetime.datetime(year, month, day, 23, 59, 59)

    fired = load_data(FIRED_FILE, parse_ts=True)
    fired_ids = set(doc["student_id"] for doc in fired)
    attendance_data = load_data(ATTENDANCE_FILE, parse_ts=True)
    attendance_records = [rec for rec in attendance_data if start <= rec["timestamp"] <= end and rec["student_id"] not in fired_ids]

    present = []
    late = []
    present_ids = set()
    late_threshold = datetime.datetime(year, month, day, 9, 30, 0)

    registered = load_data(REGISTERED_FILE, parse_ts=True)

    for rec in attendance_records:
        student = next((doc for doc in registered if doc["student_id"] == rec["student_id"]), None)
        if student:
            student = student.copy()
            student["timestamp"] = rec["timestamp"].isoformat()
            student["admin_name"] = rec.get("admin_name", ADMIN_USER)
            if rec["timestamp"] > late_threshold:
                late.append(student)
            else:
                present.append(student)
            present_ids.add(rec["student_id"])

    absent = [doc for doc in registered if doc["student_id"] not in present_ids and doc["student_id"] not in fired_ids]

    response = {
        "present": present,
        "late": late,
        "absent": absent,
        "stats": {
            "total_registered": len([doc for doc in registered if doc["student_id"] not in fired_ids]),
            "present_today": len(present),
            "late_today": len(late),
            "absent_today": len(absent)
        }
    }
    logger.info(f"Attendance data fetched for {year}-{month}-{day}: {response['stats']}")
    return jsonify(response)

# ---------------------------------------------------------------
# NOTIFICATIONS ROUTE — REWRITTEN WITH VALIDATED ABSENCE DAYS
# ---------------------------------------------------------------
@app.route("/notifications")
def notifications():
    if not session.get("admin"):
        return redirect(url_for("login"))

    today = datetime.datetime.now().date()
    absents = []
    reasons = load_data(os.path.join('data', 'absence_reasons.json'), parse_ts=True)
    fired_ids = {doc["student_id"] for doc in load_data(FIRED_FILE)}
    registered = [doc for doc in load_data(REGISTERED_FILE) if doc["student_id"] not in fired_ids]
    attendance_data = load_data(ATTENDANCE_FILE, parse_ts=True)

    # Build attendance date set per student
    attendance_by_id = {}
    for rec in attendance_data:
        sid = rec["student_id"]
        if sid not in fired_ids:
            attendance_by_id.setdefault(sid, set()).add(rec["timestamp"].date())

    for student in registered:
        sid = student["student_id"]
        attend_dates = attendance_by_id.get(sid, set())
        last_attended = max(attend_dates) if attend_dates else None

        # Case 1: Never attended
        if not last_attended:
            s = student.copy()
            s["absent_days"] = "Never"
            s["validated_days"] = 0
            s["net_absent"] = "Never"
            absents.append(s)
            continue

        # Case 2: Count consecutive absent days from today
        absent_days = 0
        check_date = today
        while check_date >= last_attended:
            if check_date not in attend_dates:
                absent_days += 1
            else:
                break
            check_date -= timedelta(days=1)

        if absent_days < 3:
            continue  # Skip if less than 3 days

        # Get validated days from reason
        entry = next((r for r in reasons if r["student_id"] == sid), None)
        validated_days = entry["valid_days"] if entry and "valid_days" in entry else 0
        net_absent = absent_days - validated_days if validated_days > 0 else absent_days

        s = student.copy()
        s["absent_days"] = absent_days
        s["validated_days"] = validated_days
        s["net_absent"] = net_absent
        absents.append(s)

    return render_template(
        "notifications.html",
        absents=absents,
        reasons=reasons
    )

@app.route("/cancel_notification", methods=["POST"])
def cancel_notification():
    if not session.get("admin"):
        flash("Unauthorized", "danger")
        return redirect(url_for("login"))

    student_id = request.form.get("student_id")
    if not student_id:
        flash("Invalid request", "danger")
        return redirect(url_for("notifications"))

    # === Add manual attendance for TODAY ===
    attendance = load_data(ATTENDANCE_FILE, parse_ts=True)
    today = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    # Avoid duplicates
    if not any(rec["student_id"] == student_id and rec["timestamp"].date() == today.date() for rec in attendance):
        registered = load_data(REGISTERED_FILE)
        staff = next((s for s in registered if s["student_id"] == student_id), None)
        if staff:
            attendance.insert(0, {
                "student_id": student_id,
                "name": staff["name"],
                "timestamp": today,
                "device": "Manual Cancel",
                "admin_name": session.get("admin_name", "Admin")
            })
            save_data(ATTENDANCE_FILE, attendance)
            flash(f"Notification canceled for {staff['name']}. Count reset.", "success")
        else:
            flash("Staff not found", "danger")
    else:
        flash("Already marked present today", "info")

    return redirect(url_for("notifications"))

# ---------------------------------------------------------------
# SAVE REASON — WITH VALID DAYS & VALIDATION
# ---------------------------------------------------------------
@app.route("/save_reason", methods=["POST"])
def save_reason():
    if not session.get("admin"):
        flash("Unauthorized", "danger")
        return redirect(url_for("notifications"))

    student_id = request.form.get("student_id")
    reason = request.form.get("reason")
    photo = request.files.get("photo")
    valid_days = request.form.get("valid_days", type=int)
    total_absent = request.form.get("total_absent", "0")
    if total_absent == "Never":
        total_absent = 0
    else:
        total_absent = int(total_absent) if total_absent.isdigit() else 0

    # === VALIDATION ===
    if not student_id or not reason:
        flash("Student ID and reason are required", "danger")
        return redirect(url_for("notifications"))

    if not valid_days or valid_days < 1:
        flash("Validated days must be at least 1", "danger")
        return redirect(url_for("notifications"))

    if total_absent and valid_days > total_absent:
        flash(f"Cannot validate more days than absent ({total_absent})", "danger")
        return redirect(url_for("notifications"))

    # === LOAD DATA SAFELY ===
    try:
        attendance = load_data(ATTENDANCE_FILE, parse_ts=True)
        registered = load_data(REGISTERED_FILE, parse_ts=True)
        fired = load_data(FIRED_FILE, parse_ts=True)
    except Exception as e:
        logger.error(f"Failed to load data in save_reason: {e}")
        flash("Server error. Please try again.", "danger")
        return redirect(url_for("notifications"))

    staff = next((s for s in registered if s["student_id"] == student_id), None)
    if not staff:
        flash("Staff not found", "danger")
        return redirect(url_for("notifications"))

    # === PARSE DATES SAFELY ===
    def parse_date(date_obj):
        if isinstance(date_obj, datetime.datetime):
            return date_obj.date()
        if isinstance(date_obj, str):
            try:
                return datetime.date.fromisoformat(date_obj.split("T")[0])
            except:
                return datetime.date.min
        return datetime.date.min

    reg_date = parse_date(staff.get("timestamp"))
    fire_rec = next((f for f in fired if f["student_id"] == student_id), None)
    fire_date = parse_date(fire_rec["fired_timestamp"]) if fire_rec else None

    today = datetime.date.today()

    # === FIND PAST ABSENT WORKING DAYS ===
    attended_dates = {
        parse_date(a["timestamp"])
        for a in attendance
        if a["student_id"] == student_id
        and (fire_date is None or parse_date(a["timestamp"]) <= fire_date)
    }

    absent_dates = []
    check_date = today - timedelta(days=1)
    max_lookback = 90  # Prevent infinite loop

    while len(absent_dates) < valid_days and check_date >= reg_date and max_lookback > 0:
        if (check_date.weekday() < 5
            and check_date not in attended_dates
            and (fire_date is None or check_date <= fire_date)):
            absent_dates.append(check_date)
        check_date -= timedelta(days=1)
        max_lookback -= 1

    actual_validated = len(absent_dates)
    if actual_validated < valid_days:
        flash(f"Only {actual_validated} past absent days found. Validated {actual_validated} day(s).", "warning")
        valid_days = actual_validated

    # === SAVE PHOTO ===
    photo_path = None
    if photo and photo.filename:
        try:
            os.makedirs('static/proofs', exist_ok=True)
            ext = photo.filename.rsplit('.', 1)[-1].lower() if '.' in photo.filename else 'jpg'
            filename = f"{student_id}_{int(time.time())}.{ext}"
            photo_path = f"proofs/{filename}"
            photo.save(os.path.join('static', photo_path))
        except Exception as e:
            logger.error(f"Photo save failed: {e}")
            flash("Photo upload failed, but reason saved.", "warning")

    # === SAVE REASON ===
    reasons_file = os.path.join('data', 'absence_reasons.json')
    try:
        reasons = load_data(reasons_file)
        # Remove old reason
        reasons = [r for r in reasons if r["student_id"] != student_id]
        # Add new
        reasons.append({
            "student_id": student_id,
            "reason": reason.strip(),
            "photo": photo_path,
            "valid_days": valid_days,
            "validated_dates": [d.isoformat() for d in absent_dates[:valid_days]],
            "timestamp": datetime.datetime.now(),
            "admin_name": session.get("admin_name", "Admin")
        })
        save_data(reasons_file, reasons)
        flash(f"Success! Validated {valid_days} past absent day(s).", "success")
    except Exception as e:
        logger.error(f"Failed to save reason: {e}")
        flash("Failed to save reason. Try again.", "danger")

    return redirect(url_for("notifications"))


# ---------------------------------------------------------------
# DELETE REASON
# ---------------------------------------------------------------
@app.route("/delete_reason", methods=["POST"])
def delete_reason():
    if not session.get("admin"):
        flash("Unauthorized", "danger")
        return redirect(url_for("notifications"))

    student_id = request.form.get("student_id")
    if not student_id:
        flash("Invalid request", "danger")
        return redirect(url_for("notifications"))

    reasons_file = os.path.join('data', 'absence_reasons.json')
    reasons = load_data(reasons_file)

    deleted = False
    new_reasons = []
    for r in reasons:
        if r["student_id"] == student_id:
            if r.get("photo"):
                path = os.path.join('static', r["photo"])
                if os.path.exists(path):
                    os.remove(path)
            deleted = True
        else:
            new_reasons.append(r)

    if deleted:
        save_data(reasons_file, new_reasons)
        flash("Reason and proof deleted", "success")
    else:
        flash("No reason found to delete", "info")

    return redirect(url_for("notifications"))
# === ONLY CHANGE 2: registered() uses parse_ts=True ===
@app.route("/registered")
def registered():
    if not session.get("admin"):
        return redirect(url_for("login"))

    students = load_data(REGISTERED_FILE, parse_ts=True)   # ← FIXED
    fired = load_data(FIRED_FILE, parse_ts=True)          # ← FIXED

    fired_ids = {s["student_id"] for s in fired}
    active_students = [s for s in students if s["student_id"] not in fired_ids]

    return render_template("registered.html",
                         students=active_students,
                         fired=fired)

@app.route("/api/staff_details/<student_id>")
def api_staff_details(student_id):
    try:
        attendance = load_data(ATTENDANCE_FILE, parse_ts=True)
        reasons = load_data(os.path.join('data', 'absence_reasons.json'), parse_ts=True)
        fired = load_data(FIRED_FILE, parse_ts=True)

        # Attendance
        att = [a for a in attendance if a["student_id"] == student_id]
        total_days = len(att)
        last_seen = att[-1]["timestamp"].strftime("%Y-%m-%d") if att else None

        # Absent Streak
        today = datetime.datetime.now().date()
        streak = 0
        for i in range(1, 31):
            check = today - timedelta(days=i)
            if any(a["timestamp"].date() == check for a in att):
                break
            streak += 1

        # Reasons
        user_reasons = [r for r in reasons if r["student_id"] == student_id]
        formatted_reasons = []
        for r in user_reasons:
            formatted_reasons.append({
                "reason": r["reason"],
                "admin_name": r["admin_name"],
                "date": r["timestamp"].strftime("%Y-%m-%d"),
                "photo": r.get("photo")
            })

        # Fired
        fired_rec = next((f for f in fired if f["student_id"] == student_id), None)
        fired_data = None
        if fired_rec:
            fired_data = {
                "fired_by": fired_rec["fired_by"],
                "date": fired_rec["fired_timestamp"].strftime("%Y-%m-%d")
            }

        return jsonify({
            "total_days": total_days,
            "last_seen": last_seen,
            "absent_streak": streak,
            "reasons": formatted_reasons,
            "fired": fired_data
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/upload_frame", methods=["POST"])
def upload_frame():
    global known_embeddings
    if 'photo' not in request.files:
        logger.error("No photo part in request")
        return jsonify({"status": "error", "message": "No photo part"}), 400
    photo = request.files['photo']
    try:
        img_array = np.frombuffer(photo.read(), np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is None:
            logger.error("Failed to decode image")
            return jsonify({"status": "error", "message": "Failed to decode image"}), 400
        faces = app_face.get(img)
        if len(faces) != 1:
            logger.info(f"Detected {len(faces)} faces in uploaded frame")
            return jsonify({"status": "error", "message": f"Detected {len(faces)} faces, expected 1"}), 400
        face = faces[0]
        if getattr(face, "det_score", 0) < 0.55:
            logger.info(f"Low-quality face in uploaded frame: det_score={face.det_score:.4f}")
            return jsonify({"status": "error", "message": "Face detected, but image quality is too low"}), 400

        if not known_embeddings:
            known_embeddings = load_known_faces()

        embedding = face.embedding.reshape(1, -1)
        best_match = None
        best_similarity = -1.0

        for student_id, data in known_embeddings.items():
            similarity = cosine_similarity(embedding, data["embedding"].reshape(1, -1))[0][0]
            logger.debug(f"Upload frame comparison with {student_id} ({data['name']}): similarity={similarity:.4f}")
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = (student_id, data)

        if best_match and best_similarity >= UPLOAD_FRAME_THRESHOLD:
            student_id, data = best_match
            today = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            attendance_data = load_data(ATTENDANCE_FILE, parse_ts=True)
            if not any(rec["student_id"] == student_id and rec["timestamp"] >= today for rec in attendance_data):
                if log_attendance(student_id, data["name"], admin_name=session.get("admin_name", session.get("admin", ADMIN_USER))):
                    logger.info(f"Attendance logged via upload for {data['name']} (ID: {student_id}) with similarity={best_similarity:.4f}")
                    return jsonify({"status": "success", "message": f"Attendance logged for {data['name']}", "similarity": round(float(best_similarity), 4)})
                logger.info(f"Attendance not logged for {data['name']} (ID: {student_id}) - already logged or failed")
                return jsonify({"status": "success", "message": f"Attendance already logged for {data['name']} today", "similarity": round(float(best_similarity), 4)})

            logger.info(f"Attendance already logged for {student_id} today")
            return jsonify({"status": "success", "message": f"Attendance already logged for {data['name']} today", "similarity": round(float(best_similarity), 4)})

        logger.info(f"No matching face found in uploaded frame. Best similarity={best_similarity:.4f}" if best_match else "No matching face found in uploaded frame")
        if best_match:
            _, data = best_match
            return jsonify({
                "status": "error",
                "message": f"No matching face found. Closest match: {data['name']} ({best_similarity:.2f})"
            }), 400
        return jsonify({"status": "error", "message": "No matching face found"}), 400
    except Exception as e:
        logger.error(f"Error processing uploaded frame: {e}")
        return jsonify({"status": "error", "message": f"Error processing frame: {str(e)}"}), 500

# === ADD TO GLOBAL ===
FIRE_REASONS_FILE = "data/fire_reasons.json"

# === UPDATE fire_staff() ===
@app.route("/fire_staff", methods=["POST"])
def fire_staff():
    global known_embeddings
    data = request.json
    student_id = data.get("student_id")
    reason = data.get("reason", "").strip()
    password = data.get("password")

    if not student_id or not password:
        return jsonify({"status": "error", "message": "Missing data"}), 400

    registered = load_data(REGISTERED_FILE)
    admin = None
    if password == ADMIN_PASS:
        admin = {"name": ADMIN_USER}
    else:
        admin = next((doc for doc in registered if doc.get("department") == ADMINS_DEPARTMENT and 
                      bcrypt.checkpw(password.encode('utf-8'), doc.get("password", "").encode('utf-8'))), None)
    
    if not admin:
        return jsonify({"status": "error", "message": "Invalid admin password"}), 401

    staff = next((doc for doc in registered if doc["student_id"] == student_id), None)
    if not staff:
        return jsonify({"status": "error", "message": "Staff not found"}), 404

    # === SAVE FIRE REASON ===
    reasons = load_data(FIRE_REASONS_FILE)
    reasons.append({
        "student_id": student_id,
        "reason": reason,
        "admin_name": admin["name"],
        "timestamp": datetime.datetime.now().isoformat()
    })
    save_data(FIRE_REASONS_FILE, reasons)

    # === MOVE TO FIRED ===
    fired = load_data(FIRED_FILE)
    if not any(doc["student_id"] == student_id for doc in fired):
        fired.append({
            "student_id": student_id,
            "name": staff["name"],
            "email": staff.get("email", ""),
            "phone": staff.get("phone", ""),
            "department": staff.get("department", ""),
            "timestamp": staff.get("timestamp"),
            "admin_name": staff.get("admin_name"),
            "fired_by": admin["name"],
            "fired_timestamp": datetime.datetime.now().isoformat(),
            "fire_reason": reason  # ← SAVE REASON HERE TOO
        })
        save_data(FIRED_FILE, fired)

    registered = [doc for doc in registered if doc["student_id"] != student_id]
    save_data(REGISTERED_FILE, registered)
    known_embeddings = load_known_faces()

    return jsonify({"status": "success", "message": f"{staff['name']} fired."})

@app.route("/delete_staff", methods=["POST"])
def delete_staff():
    global known_embeddings
    data = request.json
    student_id = data.get("student_id")
    password = data.get("password")

    if not student_id or not password:
        logger.error("Missing student_id or password for delete staff")
        return jsonify({"status": "error", "message": "Student ID and password are required"}), 400

    registered = load_data(REGISTERED_FILE)
    admin = None
    if password == ADMIN_PASS:
        admin = {"name": ADMIN_USER}
    else:
        admin = next((doc for doc in registered if doc.get("department") == ADMINS_DEPARTMENT and 
                      bcrypt.checkpw(password.encode('utf-8'), doc.get("password", "").encode('utf-8'))), None)
    
    if not admin:
        logger.error("Invalid admin password for delete staff")
        return jsonify({"status": "error", "message": "Invalid admin password"}), 401

    fired = load_data(FIRED_FILE)
    staff = next((doc for doc in fired if doc["student_id"] == student_id), None)
    if not staff:
        logger.error(f"Fired staff with ID {student_id} not found")
        return jsonify({"status": "error", "message": f"Fired staff with ID {student_id} not found"}), 404

    try:
        fired = [doc for doc in fired if doc["student_id"] != student_id]
        save_data(FIRED_FILE, fired)
        logger.info(f"Removed {student_id} from fired.json")
    except Exception as e:
        logger.error(f"Failed to remove from fired.json for {student_id}: {e}")
        return jsonify({"status": "error", "message": "Failed to delete staff from fired list due to server error"}), 500

    image_path = f'static/images/{student_id}.jpg'
    try:
        if os.path.exists(image_path):
            os.remove(image_path)
            logger.info(f"Removed image for {student_id}")
    except Exception as e:
        logger.warning(f"Failed to remove image for {student_id}: {e}")

    logger.info(f"Staff {staff['name']} (ID: {student_id}) permanently deleted")
    return jsonify({"status": "success", "message": f"Staff {staff['name']} permanently deleted from system"})

@app.route("/reports")
def reports():
    return render_template("report.html")

@app.route("/api/company_report")
def api_company_report():
    try:
        # -----------------------------------------------------------------
        # 1. Get period parameters
        # -----------------------------------------------------------------
        period = request.args.get('period', 'monthly').lower()
        now = datetime.datetime.now()
        start = end = None
        
        # Load data with proper error handling
        try:
            attendance = load_data(ATTENDANCE_FILE, parse_ts=True)
            staff_list = load_data(REGISTERED_FILE, parse_ts=True)
            fired_list = load_data(FIRED_FILE, parse_ts=True)
            absence_reasons = load_data(os.path.join('data', 'absence_reasons.json'), parse_ts=True)
        except Exception as e:
            logger.error(f"Failed to load data files: {e}")
            return jsonify({"error": "Could not load attendance data"}), 500

        # -----------------------------------------------------------------
        # 2. Build the report date range with validation
        # -----------------------------------------------------------------
        if period == 'daily':
            date_str = request.args.get('date')
            if not date_str: 
                return jsonify({"error": "date required for daily"}), 400
            try:
                start = end = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

        elif period == 'weekly':
            try:
                week = int(request.args.get('week', 1))
                month = int(request.args.get('month'))
                year = int(request.args.get('year'))
                
                if not (1 <= week <= 5) or not (1 <= month <= 12) or not (1900 <= year <= 2100):
                    return jsonify({"error": "Invalid week/month/year"}), 400

                first_day = datetime.date(year, month, 1)
                first_monday = first_day + timedelta(days=(7 - first_day.weekday()) % 7)
                week_start = first_monday + timedelta(weeks=week - 1)
                week_end = week_start + timedelta(days=4)

                # Handle month boundaries
                if month == 12:
                    month_end = datetime.date(year, 12, 31)
                else:
                    month_end = datetime.date(year, month + 1, 1) - timedelta(days=1)
                
                start = max(week_start, first_day)
                end = min(week_end, month_end)
                
            except (ValueError, TypeError) as e:
                return jsonify({"error": "Invalid week/month/year parameters"}), 400

        elif period == 'monthly':
            try:
                month = int(request.args.get('month', now.month))
                year = int(request.args.get('year', now.year))
                
                if not (1 <= month <= 12) or not (1900 <= year <= 2100):
                    return jsonify({"error": "Invalid month/year"}), 400
                    
                start = datetime.date(year, month, 1)
                if month == 12:
                    end = datetime.date(year, 12, 31)
                else:
                    end = datetime.date(year, month + 1, 1) - timedelta(days=1)
                    
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid month/year parameters"}), 400

        elif period == 'yearly':
            try:
                year = int(request.args.get('year', now.year))
                if not (1900 <= year <= 2100):
                    return jsonify({"error": "Invalid year"}), 400
                start = datetime.date(year, 1, 1)
                end = datetime.date(year, 12, 31)
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid year parameter"}), 400

        else:
            return jsonify({"error": "Invalid period"}), 400

        # Validate date range
        if start > end:
            return jsonify({"error": "Invalid date range"}), 400

        logger.info(f"Report period: {start} to {end}")

        # -----------------------------------------------------------------
        # 3. Working days (Mon-Fri) inside the report period
        # -----------------------------------------------------------------
        today = datetime.date.today()
        working_days = []
        cur = start
        while cur <= end and cur <= today:  # ← STOP AT TODAY
            if cur.weekday() < 5:  # Mon-Fri
                working_days.append(cur)
            cur += timedelta(days=1)

        # -----------------------------------------------------------------
        # 4. Initialize counters
        # -----------------------------------------------------------------
        total_expected = 0
        total_present = 0
        on_time_cnt = 0
        late_cnt = 0
        validated_absent = 0
        active_staff = 0

        # Helper function for staff attendance in period
        def staff_att_in_period(sid):
            return [a for a in attendance 
                    if start <= a['timestamp'].date() <= end 
                    and a['student_id'] == sid 
                    and a['timestamp'].date().weekday() < 5]

        # -----------------------------------------------------------------
        # 5. GLOBAL VALIDATED DAYS CALCULATION (across all periods)
        # Calculate which specific days are validated for each staff
        # -----------------------------------------------------------------
        global_validated_days = {}  # {staff_id: set(validated_dates)}
        
        # Process all reasons chronologically (oldest first)
        sorted_reasons = sorted(absence_reasons, key=lambda x: x['timestamp'])
        
        for reason in sorted_reasons:
            sid = reason['student_id']
            reason_date = reason['timestamp'].date()
            valid_days = int(reason.get('valid_days', 0) or 0)
            
            if valid_days <= 0:
                continue
                
            # Find the staff member
            staff = next((s for s in staff_list if s['student_id'] == sid), None)
            if not staff:
                continue
                
            reg_date = staff['timestamp'].date()
            fire_rec = next((f for f in fired_list if f['student_id'] == sid), None)
            fire_date = fire_rec['fired_timestamp'].date() if fire_rec else None
            
            # Initialize staff in the dictionary
            if sid not in global_validated_days:
                global_validated_days[sid] = set()
            
            # Find the most recent absent days to validate (working days only)
            # We look back from the reason date to find absent working days
            days_to_validate = []
            current_day = reason_date
            
            # Look back up to 60 days to find enough absent days to validate
            lookback_limit = 60
            days_checked = 0
            
            while len(days_to_validate) < valid_days and days_checked < lookback_limit and current_day >= reg_date:
                # Check if this day should be considered
                if (current_day.weekday() < 5 and  # Mon-Fri
                    current_day <= (fire_date or datetime.date.today()) and  # Within employment
                    current_day not in global_validated_days[sid]):  # Not already validated
                    
                    # Check if staff was actually absent on this day (no attendance record)
                    was_absent = True
                    for att_record in attendance:
                        if (att_record['student_id'] == sid and 
                            att_record['timestamp'].date() == current_day):
                            was_absent = False
                            break
                    
                    if was_absent:
                        days_to_validate.append(current_day)
                
                current_day -= timedelta(days=1)
                days_checked += 1
            
            # Add the validated days to the global set
            for day in days_to_validate:
                global_validated_days[sid].add(day)
            
            logger.debug(f"Staff {sid}: Reason on {reason_date} validated {len(days_to_validate)} days: {sorted(days_to_validate)}")

        # -----------------------------------------------------------------
        # 6. Loop over every staff for main calculations
        # -----------------------------------------------------------------
        for staff in staff_list:
            sid = staff['student_id']
            reg_date = staff['timestamp'].date()

            # Fire record (if any)
            fire_rec = next((f for f in fired_list if f['student_id'] == sid), None)
            fire_date = fire_rec['fired_timestamp'].date() if fire_rec else None

            # Check if active at the end of the period
            if reg_date <= end and (fire_date is None or fire_date > end):
                active_staff += 1

            # Employment window for this report
            emp_start = max(reg_date, start)
            emp_end = min(fire_date or end, end)

            if emp_start > emp_end:
                continue  # Not employed in this period

            # Expected working days for this employee
            expected = [d for d in working_days if emp_start <= d <= emp_end]
            total_expected += len(expected)

            # Actual attendance inside employment window
            att = [a for a in staff_att_in_period(sid) 
                   if emp_start <= a['timestamp'].date() <= emp_end]
            total_present += len(att)

            # On-time / late (9:30 cutoff)
            for a in att:
                if a['timestamp'].time() < datetime.time(9, 30):
                    on_time_cnt += 1
                else:
                    late_cnt += 1

            # Count validated absences for this staff in THIS SPECIFIC PERIOD only
            if sid in global_validated_days:
                for validated_day in global_validated_days[sid]:
                    # Only count if the validated day falls within THIS report period
                    if start <= validated_day <= end:
                        validated_absent += 1
                        logger.debug(f"Validated day {validated_day} for staff {sid} in period {start} to {end}")

        # -----------------------------------------------------------------
        # 7. Final calculations
        # -----------------------------------------------------------------
        raw_absent = total_expected - total_present
        absent = max(0, raw_absent - validated_absent)

        # Fired & new hires in the report period
        fired_in_period = [f for f in fired_list 
                          if start <= f['fired_timestamp'].date() <= end]
        new_hires_in_period = [s for s in staff_list 
                              if start <= s['timestamp'].date() <= end]

        logger.info(f"Final stats - Period: {start} to {end}")
        logger.info(f"Expected: {total_expected}, Present: {total_present}")
        logger.info(f"Raw Absent: {raw_absent}, Validated: {validated_absent}, Final Absent: {absent}")

        # Debug info for validated days in this period
        if global_validated_days:
            period_validated_days = []
            for sid, days_set in global_validated_days.items():
                for day in days_set:
                    if start <= day <= end:
                        period_validated_days.append(f"{sid}:{day}")
            logger.info(f"Validated days in this period: {period_validated_days}")

        # -----------------------------------------------------------------
        # 8. Response
        # -----------------------------------------------------------------
        return jsonify({
            "total_staff": active_staff,
            "on_time": on_time_cnt,
            "late": late_cnt,
            "absent": absent,
            "validated_absence_days": validated_absent,
            "fired_count": len(fired_in_period),
            "new_registrations": len(new_hires_in_period)
        })

    except Exception as e:
        logger.error(f"API Error in company_report: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500

# ---------------------------
if __name__ == "__main__":
    try:
        flask_host = os.getenv("HOST", "0.0.0.0")
        flask_port = int(os.getenv("PORT", "8000"))
        use_reloader_process = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
        should_start_sync = ENABLE_ESP32_SYNC and use_reloader_process

        if should_start_sync:
            time_thread = threading.Thread(target=send_time, daemon=True)
            time_thread.start()
            print(f"Flask server running with ESP32 time sync at {URL}...")
        elif ENABLE_ESP32_SYNC:
            logger.info("ESP32 sync requested; waiting for Flask reloader child process.")
        else:
            logger.info("ESP32 time sync disabled for local preview. Set ENABLE_ESP32_SYNC=1 to enable it.")
        
        logger.info("Starting Flask app")
        logger.info(f"Webpage: http://127.0.0.1:{flask_port}")
        
        # Run the app
        app.run(host=flask_host, port=flask_port, debug=True)
        
    except Exception as e:
        logger.error(f"Flask app failed to start: {e}")
        raise
