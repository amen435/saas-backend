from flask import Flask, Response, jsonify, request
import base64
import cv2
import datetime
from insightface.app import FaceAnalysis
import logging
import numpy as np
import os
import time


THRESHOLD = 0.7
DEFAULT_ATTENDANCE_CAMERA_SOURCE = "pc"
FACE_API_KEY = os.getenv("FACE_API_KEY", "").strip()
FACE_MODEL_NAME = os.getenv("FACE_MODEL_NAME", "buffalo_s").strip() or "buffalo_s"
FACE_DET_SIZE = int(os.getenv("FACE_DET_SIZE", "320"))
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "0").lower() in ("1", "true", "yes", "on")


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


try:
    app_face = FaceAnalysis(name=FACE_MODEL_NAME, providers=["CPUExecutionProvider"])
    app_face.prepare(ctx_id=0, det_size=(FACE_DET_SIZE, FACE_DET_SIZE))
    logger.info("FaceAnalysis initialized with model=%s det_size=%s", FACE_MODEL_NAME, FACE_DET_SIZE)
except Exception as error:
    logger.error("FaceAnalysis initialization failed: %s", error)
    raise


app = Flask(__name__)


def require_face_api_key():
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

    return image


def extract_single_face_embedding(image_base64):
    image = decode_base64_image(image_base64)
    faces = app_face.get(image)

    if len(faces) == 0:
        raise ValueError("No face detected in the provided image.")
    if len(faces) > 1:
        raise ValueError("Multiple faces detected. Provide an image with exactly one face.")

    face = faces[0]
    det_score = float(getattr(face, "det_score", 0.0) or 0.0)
    if det_score < THRESHOLD:
        raise ValueError("Face quality is too low. Please upload a clearer image.")

    embedding = getattr(face, "embedding", None)
    if embedding is None:
        raise ValueError("Face embedding could not be generated.")

    embedding_list = np.asarray(embedding, dtype=np.float32).flatten().tolist()
    if len(embedding_list) != 512:
        raise ValueError("Embedding service returned an unexpected embedding length.")

    return embedding_list, det_score


current_name = "No Face"
is_registration_mode = False
attendance_camera_source = DEFAULT_ATTENDANCE_CAMERA_SOURCE


def annotate_frame(frame, faces, label):
    for face in faces:
        x1, y1, x2, y2 = face.bbox.astype(int)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            frame,
            label,
            (x1, max(y1 - 10, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 0),
            2,
        )
    return frame


def evaluate_frame(frame):
    global current_name
    faces = app_face.get(frame)

    if len(faces) == 0:
        current_name = "No Face"
    elif len(faces) > 1:
        current_name = "Multiple Faces"
    else:
        face = faces[0]
        if float(getattr(face, "det_score", 0.0) or 0.0) < THRESHOLD:
            current_name = "Poor Quality"
        else:
            current_name = "Face Detected"

    label = current_name if len(faces) == 1 else ("Multiple" if len(faces) > 1 else "No Face")
    return annotate_frame(frame, faces, label)


def open_pc_camera():
    backends = []
    if hasattr(cv2, "CAP_DSHOW"):
        backends.append(cv2.CAP_DSHOW)
    if hasattr(cv2, "CAP_MSMF"):
        backends.append(cv2.CAP_MSMF)
    backends.append(None)

    for backend in backends:
        try:
            cap = cv2.VideoCapture(0) if backend is None else cv2.VideoCapture(0, backend)
            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                continue
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_FPS, 30)
            return cap
        except Exception:
            continue

    logger.error("Failed to open PC webcam")
    return None


def stream_pc_frames():
    cap = open_pc_camera()
    if cap is None:
        return

    try:
        while True:
            success, frame = cap.read()
            if not success:
                time.sleep(0.1)
                continue

            frame = evaluate_frame(frame)
            encoded, buffer = cv2.imencode(".jpg", frame)
            if not encoded:
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
            )
    finally:
        cap.release()


def get_attendance_camera_source():
    global attendance_camera_source
    source = request.args.get("source")
    if source == "pc":
        attendance_camera_source = source
    return attendance_camera_source


@app.route("/", methods=["GET"])
def root():
    return jsonify({
        "status": "ok",
        "service": "face-service",
        "message": "Use /health, /generate-embedding, /video_feed, or /register_video_feed.",
    })


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "face-service",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "cameraSource": "pc",
    })


@app.route("/generate-embedding", methods=["POST"])
def generate_embedding():
    auth_error = require_face_api_key()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    image_base64 = payload.get("imageBase64")

    try:
        embedding, det_score = extract_single_face_embedding(image_base64)
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


@app.route("/recognize_status", methods=["GET"])
def recognize_status():
    return jsonify({"name": current_name})


@app.route("/set_attendance_camera_source", methods=["POST"])
def set_attendance_camera_source():
    global attendance_camera_source
    source = request.json.get("source") if request.is_json else request.form.get("source")
    if source != "pc":
        return jsonify({"status": "error", "message": "Invalid camera source"}), 400

    attendance_camera_source = source
    return jsonify({"status": "success", "source": attendance_camera_source})


@app.route("/video_feed", methods=["GET"])
def video_feed():
    global is_registration_mode
    is_registration_mode = False
    get_attendance_camera_source()
    logger.info("Starting PC webcam feed for attendance")
    return Response(stream_pc_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/register_video_feed", methods=["GET"])
def register_video_feed():
    global is_registration_mode
    is_registration_mode = True
    logger.info("Starting PC webcam feed for registration preview")
    return Response(stream_pc_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/stop_camera", methods=["POST"])
def stop_camera():
    logger.info("Camera stop not required for streaming service")
    return jsonify({"status": "success", "message": "Camera stop not required"})


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    logger.info("Starting Flask app")
    logger.info("Webpage: http://127.0.0.1:%s", port)
    app.run(host=host, port=port, debug=FLASK_DEBUG, use_reloader=False)
