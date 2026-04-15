import os
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path


MODEL_NAME = os.getenv("FACE_MODEL_NAME", "buffalo_s").strip() or "buffalo_s"
MODEL_ROOT = Path(
    os.getenv(
        "FACE_MODEL_ROOT",
        str(Path(__file__).resolve().parents[1] / "models"),
    )
).resolve()
MODEL_URL = os.getenv(
    "FACE_MODEL_URL",
    f"https://github.com/deepinsight/insightface/releases/download/v0.7/{MODEL_NAME}.zip",
).strip()


def main():
    target_dir = MODEL_ROOT / MODEL_NAME
    if target_dir.exists() and any(target_dir.iterdir()):
        print(f"Model already available at {target_dir}")
        return

    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {MODEL_NAME} model from {MODEL_URL}")

    with tempfile.TemporaryDirectory() as tmp_dir:
        archive_path = Path(tmp_dir) / f"{MODEL_NAME}.zip"
        extract_dir = Path(tmp_dir) / "extract"
        urllib.request.urlretrieve(MODEL_URL, archive_path)

        with zipfile.ZipFile(archive_path, "r") as archive:
            archive.extractall(extract_dir)

        extracted_model_dir = extract_dir / MODEL_NAME
        if not extracted_model_dir.exists():
            raise RuntimeError(f"Expected extracted model directory at {extracted_model_dir}")

        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(extracted_model_dir, target_dir)

    print(f"Model ready at {target_dir}")


if __name__ == "__main__":
    main()
