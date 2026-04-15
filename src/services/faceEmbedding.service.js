const EMBEDDING_ENDPOINT = '/generate-embedding';

function createServiceError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeBase64Image(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : raw;
}

async function generateFaceEmbedding(photoBase64) {
  const imageBase64 = normalizeBase64Image(photoBase64);
  if (!imageBase64) {
    throw createServiceError('Face image is required.', 400);
  }

  const baseUrl = String(process.env.FACE_EMBEDDING_API_URL || 'http://127.0.0.1:5000').trim().replace(/\/+$/, '');
  const faceApiKey = String(process.env.FACE_API_KEY || '').trim();
  let response;
  try {
    response = await fetch(`${baseUrl}${EMBEDDING_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(faceApiKey ? { 'x-api-key': faceApiKey } : {}),
      },
      body: JSON.stringify({
        imageBase64,
      }),
    });
  } catch (error) {
    throw createServiceError('Face embedding service is unavailable.', 502);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const reason = payload?.error || payload?.message || `Embedding service failed with status ${response.status}`;
    const statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw createServiceError(reason, statusCode);
  }

  const embedding = payload?.embedding || payload?.faceEmbedding || payload?.data?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0 || embedding.some((value) => !Number.isFinite(Number(value)))) {
    throw createServiceError('Embedding service returned an invalid face embedding.', 502);
  }

  return {
    photoBase64: imageBase64,
    faceEmbedding: embedding.map((value) => Number(value)),
  };
}

module.exports = {
  generateFaceEmbedding,
  normalizeBase64Image,
};
