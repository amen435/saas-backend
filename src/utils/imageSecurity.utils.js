const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PRIVATE_UPLOAD_ROOT = path.join(__dirname, '..', '..', 'storage', 'private', 'uploads');
const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', { extension: 'jpg', signatures: ['ffd8ff'] }],
  ['image/png', { extension: 'png', signatures: ['89504e470d0a1a0a'] }],
  ['image/webp', { extension: 'webp', signatures: ['52494646'] }],
]);

function createImageValidationError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function ensurePrivateUploadDir(relativeDir = '') {
  const safeDir = String(relativeDir || '')
    .split(/[\\/]/)
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-z0-9_-]/gi, ''))
    .filter(Boolean)
    .join(path.sep);

  const targetDir = path.join(PRIVATE_UPLOAD_ROOT, safeDir);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

function createRandomFileName(extension) {
  const safeExtension = String(extension || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  return `${crypto.randomUUID()}.${safeExtension}`;
}

function stripDataUriPrefix(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    return {
      declaredMimeType: null,
      base64Payload: raw,
    };
  }

  return {
    declaredMimeType: String(match[1] || '').toLowerCase(),
    base64Payload: String(match[2] || '').trim(),
  };
}

function decodeBase64Image(value) {
  const { declaredMimeType, base64Payload } = stripDataUriPrefix(value);
  if (!base64Payload) {
    throw createImageValidationError('Image is required.');
  }

  let buffer;
  try {
    buffer = Buffer.from(base64Payload, 'base64');
  } catch {
    throw createImageValidationError('Image data is not valid base64.');
  }

  if (!buffer.length) {
    throw createImageValidationError('Image data is empty.');
  }

  return {
    buffer,
    declaredMimeType,
  };
}

function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  const hex = buffer.subarray(0, 12).toString('hex');
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';

  const riff = buffer.subarray(0, 4).toString('ascii');
  const webp = buffer.subarray(8, 12).toString('ascii');
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';

  return null;
}

function assertAllowedMimeType(mimeType, fallbackMessage = 'Only JPG, PNG, and WebP images are allowed.') {
  if (!ALLOWED_IMAGE_TYPES.has(String(mimeType || '').toLowerCase())) {
    throw createImageValidationError(fallbackMessage);
  }
}

function assertMimeMatchesSignature(declaredMimeType, detectedMimeType) {
  if (!declaredMimeType) return;
  if (declaredMimeType !== detectedMimeType) {
    throw createImageValidationError('Image MIME type does not match the file signature.');
  }
}

async function sanitizeImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createImageValidationError('Image buffer is required.');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw createImageValidationError('Image exceeds the maximum allowed size of 2MB.', 413);
  }

  const detectedMimeType = detectImageMimeType(buffer);
  assertAllowedMimeType(detectedMimeType, 'Unsupported or malformed image file.');

  let metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw createImageValidationError('Image file is malformed or unreadable.');
  }

  if (!metadata.width || !metadata.height) {
    throw createImageValidationError('Image dimensions could not be determined.');
  }

  const hasAlpha = Boolean(metadata.hasAlpha);
  const transformer = sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({
      width: Math.min(metadata.width, 1600),
      height: Math.min(metadata.height, 1600),
      fit: 'inside',
      withoutEnlargement: true,
    });

  let sanitizedBuffer;
  let outputMimeType;
  let extension;

  if (hasAlpha) {
    sanitizedBuffer = await transformer.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    outputMimeType = 'image/png';
    extension = 'png';
  } else {
    sanitizedBuffer = await transformer.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    outputMimeType = 'image/jpeg';
    extension = 'jpg';
  }

  if (sanitizedBuffer.length > MAX_IMAGE_BYTES) {
    throw createImageValidationError('Sanitized image exceeds the maximum allowed size of 2MB.', 413);
  }

  return {
    buffer: sanitizedBuffer,
    mimeType: outputMimeType,
    extension,
  };
}

async function sanitizeBase64Image(imageBase64) {
  const { buffer, declaredMimeType } = decodeBase64Image(imageBase64);
  const detectedMimeType = detectImageMimeType(buffer);
  assertAllowedMimeType(detectedMimeType, 'Unsupported or malformed image file.');
  assertMimeMatchesSignature(declaredMimeType, detectedMimeType);

  return sanitizeImageBuffer(buffer);
}

function buildImageDataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

function persistPrivateImage(relativeDir, processedImage) {
  const targetDir = ensurePrivateUploadDir(relativeDir);
  const filename = createRandomFileName(processedImage.extension);
  const absolutePath = path.join(targetDir, filename);

  fs.writeFileSync(absolutePath, processedImage.buffer, { mode: 0o600 });

  return {
    filename,
    absolutePath,
    relativeAssetPath: `/uploads/${String(relativeDir || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/${filename}`.replace(/\/{2,}/g, '/'),
    mimeType: processedImage.mimeType,
    size: processedImage.buffer.length,
  };
}

function resolvePrivateUploadPath(assetPath) {
  const normalized = String(assetPath || '').replace(/^\/+/, '');
  if (!normalized.startsWith('uploads/')) {
    return null;
  }

  const relativePath = normalized.slice('uploads/'.length);
  const safeSegments = relativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, ''));

  if (!safeSegments.length) {
    return null;
  }

  const absolutePath = path.join(PRIVATE_UPLOAD_ROOT, ...safeSegments);
  const resolvedRoot = path.resolve(PRIVATE_UPLOAD_ROOT);
  const resolvedFile = path.resolve(absolutePath);
  if (!resolvedFile.startsWith(resolvedRoot)) {
    return null;
  }

  return resolvedFile;
}

module.exports = {
  MAX_IMAGE_BYTES,
  PRIVATE_UPLOAD_ROOT,
  ALLOWED_IMAGE_TYPES,
  createImageValidationError,
  detectImageMimeType,
  sanitizeImageBuffer,
  sanitizeBase64Image,
  buildImageDataUri,
  persistPrivateImage,
  resolvePrivateUploadPath,
};
