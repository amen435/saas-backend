const crypto = require('crypto');

function createUploadError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function inferImageExtension(imageBase64) {
  const raw = String(imageBase64 || '').trim().toLowerCase();
  if (raw.startsWith('data:image/png')) return 'png';
  if (raw.startsWith('data:image/webp')) return 'webp';
  if (raw.startsWith('data:image/jpg') || raw.startsWith('data:image/jpeg')) return 'jpg';
  return 'jpg';
}

function ensureDataUri(imageBase64) {
  const raw = String(imageBase64 || '').trim();
  if (!raw) {
    throw createUploadError('Image is required for upload.', 400);
  }

  if (raw.startsWith('data:image/')) {
    return raw;
  }

  const extension = inferImageExtension(raw);
  const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mimeType};base64,${raw}`;
}

function getCloudinaryConfig() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  const folder = String(process.env.CLOUDINARY_FOLDER || 'intelli-campus').trim();

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder,
    enabled: Boolean(cloudName && apiKey && apiSecret),
  };
}

function signCloudinaryParams(params, apiSecret) {
  const sorted = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${sorted}${apiSecret}`).digest('hex');
}

async function uploadToCloudinary({ imageBase64, entity, identifier }) {
  const config = getCloudinaryConfig();
  if (!config.enabled) {
    return null;
  }

  const safeEntity = String(entity || 'images').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'images';
  const safeIdentifier = String(identifier || Date.now()).trim().replace(/[^a-zA-Z0-9-_]/g, '') || String(Date.now());
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${safeEntity}/${safeIdentifier}-${Date.now()}`;
  const folder = `${config.folder}/${safeEntity}`;
  const signature = signCloudinaryParams(
    {
      folder,
      public_id: publicId,
      timestamp,
    },
    config.apiSecret
  );

  const formData = new FormData();
  formData.append('file', ensureDataUri(imageBase64));
  formData.append('api_key', config.apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  formData.append('signature', signature);

  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    throw createUploadError('Cloudinary upload service is unavailable.', 502);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw createUploadError(payload?.error?.message || `Cloudinary upload failed with status ${response.status}`, statusCode);
  }

  return {
    photoUrl: payload?.secure_url || payload?.url,
    publicId: payload?.public_id || publicId,
  };
}

async function uploadImage({ imageBase64, entity, identifier }) {
  const raw = String(imageBase64 || '').trim();
  if (!raw) {
    throw createUploadError('Image is required for upload.', 400);
  }

  const cloudinaryResult = await uploadToCloudinary({ imageBase64: raw, entity, identifier });
  if (cloudinaryResult?.photoUrl) {
    return cloudinaryResult;
  }

  const safeEntity = String(entity || 'images').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'images';
  const safeIdentifier = String(identifier || Date.now()).trim().replace(/[^a-zA-Z0-9-_]/g, '') || String(Date.now());
  const extension = inferImageExtension(raw);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return {
    photoUrl: `https://mock-storage.intelli-campus.local/${safeEntity}/${safeIdentifier}-${timestamp}.${extension}`,
  };
}

module.exports = {
  uploadImage,
};
