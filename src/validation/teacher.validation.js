const { z } = require('zod');

const nonEmptyString = (label) => z.string({ required_error: `${label} is required.` }).trim().min(1, `${label} is required.`);
const optionalTrimmedString = z.string().trim().min(1).optional();
const optionalNullableString = z.union([z.string().trim().min(1), z.null()]).optional();
const optionalImage = z.string().trim().min(1).optional();

const teacherCreatePayloadSchema = z.object({
  userId: nonEmptyString('userId'),
  username: nonEmptyString('username'),
  password: nonEmptyString('password'),
  fullName: nonEmptyString('fullName'),
  role: z.enum(['TEACHER', 'HOMEROOM_TEACHER']).optional(),
  email: z.string().trim().email().optional(),
  phone: optionalNullableString,
  specialization: optionalNullableString,
  classId: z.coerce.number().int().positive('classId must be a valid positive integer.').optional(),
  faceImageBase64: optionalImage,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  isActive: z.boolean().optional(),
}).passthrough();

const teacherUpdatePayloadSchema = teacherCreatePayloadSchema.partial().extend({
  classId: z.coerce.number().int().positive('classId must be a valid positive integer.').nullable().optional(),
});

const createTeacherSchema = z.object({}).passthrough().superRefine((data, ctx) => {
  const result = teacherCreatePayloadSchema.safeParse(data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue(issue);
    }
  }

  if (!data.faceImageBase64) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['faceImageBase64'],
      message: 'faceImageBase64 is required.',
    });
  }
});

const updateTeacherSchema = z.object({}).passthrough().superRefine((data, ctx) => {
  const result = teacherUpdatePayloadSchema.safeParse(data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue(issue);
    }
  }
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a valid positive integer.'),
});

module.exports = {
  createTeacherSchema,
  updateTeacherSchema,
  idParamSchema,
};
