const { z } = require('zod');

const recognizeAttendanceSchema = z
  .object({
    imageBase64: z.string().trim().min(1, 'imageBase64 is required.'),
    deviceId: z.string().trim().min(1, 'deviceId is required.').optional(),
    classId: z.coerce.number().int().positive('classId must be a positive integer.').optional(),
    timestamp: z.string().datetime().optional(),
  })
  .superRefine((payload, ctx) => {
    if (!payload.deviceId && !payload.classId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['classId'],
        message: 'classId or deviceId is required.',
      });
    }
  });

module.exports = {
  recognizeAttendanceSchema,
};
