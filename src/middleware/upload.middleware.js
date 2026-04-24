const multer = require('multer');
const {
  MAX_IMAGE_BYTES,
  persistPrivateImage,
  sanitizeImageBuffer,
} = require('../utils/imageSecurity.utils');

const imageFileFilter = (req, file, cb) => {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return cb(new Error('Only JPG, PNG, and WebP image uploads are allowed.'));
  }

  cb(null, true);
};

function createImageUpload(relativeDir) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_IMAGE_BYTES,
      files: 1,
    },
    fileFilter: imageFileFilter,
  });

  const finalizeUpload = async (req, res, next) => {
    try {
      if (!req.file?.buffer) {
        return next();
      }

      const processedImage = await sanitizeImageBuffer(req.file.buffer);
      const storedImage = persistPrivateImage(relativeDir, processedImage);

      req.file = {
        ...req.file,
        filename: storedImage.filename,
        path: storedImage.absolutePath,
        mimetype: storedImage.mimeType,
        size: storedImage.size,
        assetPath: storedImage.relativeAssetPath,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };

  return {
    single(fieldName) {
      return [upload.single(fieldName), finalizeUpload];
    },
  };
}

module.exports = {
  createImageUpload,
};
