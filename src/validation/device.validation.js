const { z } = require('zod');

const createDeviceSchema = z.object({
  deviceId: z.string().trim().min(1, 'deviceId is required.'),
  deviceType: z.enum(['WEBCAM', 'ESP32_CAM']),
  classId: z.coerce.number().int().positive('classId must be a valid positive integer.'),
  location: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
}).passthrough();

module.exports = {
  createDeviceSchema,
};
