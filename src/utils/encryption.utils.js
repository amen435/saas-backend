const crypto = require('crypto');

const ENCRYPTION_PREFIX = 'enc:v1:';

function createEncryptionError(message) {
  return Object.assign(new Error(message), { statusCode: 500 });
}

function getEncryptionKey() {
  const rawKey = String(process.env.DATA_ENCRYPTION_KEY || '').trim();
  if (!rawKey) {
    throw createEncryptionError('DATA_ENCRYPTION_KEY is not configured.');
  }

  let keyBuffer;
  try {
    keyBuffer = /^[0-9a-f]{64}$/i.test(rawKey)
      ? Buffer.from(rawKey, 'hex')
      : Buffer.from(rawKey, 'base64');
  } catch {
    throw createEncryptionError('DATA_ENCRYPTION_KEY is invalid.');
  }

  if (keyBuffer.length !== 32) {
    throw createEncryptionError('DATA_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).');
  }

  return keyBuffer;
}

function isEncrypted(value) {
  return String(value || '').startsWith(ENCRYPTION_PREFIX);
}

function encryptText(value) {
  if (value == null || value === '') return value;

  const plainText = String(value);
  if (isEncrypted(plainText)) return plainText;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptText(value) {
  if (value == null || value === '') return value;

  const encoded = String(value);
  if (!isEncrypted(encoded)) return encoded;

  const payload = encoded.slice(ENCRYPTION_PREFIX.length);
  const [ivBase64, tagBase64, cipherBase64] = payload.split(':');
  if (!ivBase64 || !tagBase64 || !cipherBase64) {
    throw createEncryptionError('Encrypted payload is malformed.');
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(ivBase64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherBase64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    throw createEncryptionError('Encrypted payload could not be decrypted.');
  }
}

module.exports = {
  ENCRYPTION_PREFIX,
  encryptText,
  decryptText,
  isEncrypted,
};
