const fs = require('fs');
const path = require('path');
const multer = require('multer');

const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/webp', ['.webp']],
]);

const ensureUploadDir = (relativeDir) => {
  const targetDir = path.join(__dirname, '..', '..', 'uploads', relativeDir);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
};

const createStorage = (relativeDir, filePrefix) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, ensureUploadDir(relativeDir));
    },
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname || '').toLowerCase() || '.png';
      const safePrefix = String(filePrefix || 'upload').replace(/[^a-z0-9_-]/gi, '_');
      cb(null, `${safePrefix}-${Date.now()}${extension}`);
    },
  });

const imageFileFilter = (req, file, cb) => {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  const extension = path.extname(file?.originalname || '').toLowerCase();
  const allowedExtensions = ALLOWED_IMAGE_TYPES.get(mimeType);

  if (!allowedExtensions || !allowedExtensions.includes(extension)) {
    return cb(new Error('Only JPG, PNG, and WebP image uploads are allowed.'));
  }

  cb(null, true);
};

const createImageUpload = (relativeDir, filePrefix) =>
  multer({
    storage: createStorage(relativeDir, filePrefix),
    limits: {
      fileSize: 5 * 1024 * 1024,
    },
    fileFilter: imageFileFilter,
  });

module.exports = {
  createImageUpload,
};
