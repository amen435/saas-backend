const fs = require('fs');
const path = require('path');
const multer = require('multer');

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
  if (!file?.mimetype?.startsWith('image/')) {
    return cb(new Error('Only image uploads are allowed.'));
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
