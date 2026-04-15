const { z } = require('zod');

const recognizeAttendanceSchema = z.object({
  imageBase64: z.string().trim().min(1, 'imageBase64 is required.'),
  deviceId: z.string().trim().min(1, 'deviceId is required.'),
  timestamp: z.string().datetime().optional(),
});

module.exports = {
  recognizeAttendanceSchema,
};
