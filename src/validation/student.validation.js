const { z } = require('zod');

const nonEmptyString = (label) => z.string({ required_error: `${label} is required.` }).trim().min(1, `${label} is required.`);
const optionalTrimmedString = z.string().trim().min(1).optional();
const optionalNullableString = z.union([z.string().trim().min(1), z.null()]).optional();
const optionalImage = z.string().trim().min(1).optional();

const parentSchema = z.object({
  phoneNumber: nonEmptyString('parent.phoneNumber'),
  fullName: nonEmptyString('parent.fullName'),
  relationship: optionalTrimmedString,
  userId: optionalTrimmedString,
  password: optionalTrimmedString,
  occupation: optionalTrimmedString,
  address: optionalTrimmedString,
  username: optionalTrimmedString,
  email: z.string().trim().email().optional(),
}).passthrough();

const studentPayloadSchema = z.object({
  userId: nonEmptyString('userId'),
  username: nonEmptyString('username'),
  password: nonEmptyString('password'),
  fullName: nonEmptyString('fullName'),
  classId: z.coerce.number().int().positive('classId must be a valid positive integer.'),
  email: z.string().trim().email().optional(),
  phone: optionalNullableString,
  studentCode: optionalNullableString,
  dateOfBirth: optionalNullableString,
  dob: optionalNullableString,
  gender: optionalNullableString,
  guardianName: optionalNullableString,
  guardianPhone: optionalNullableString,
  address: optionalNullableString,
  faceImageBase64: optionalImage,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  isActive: z.boolean().optional(),
}).passthrough();

const studentUpdatePayloadSchema = studentPayloadSchema.partial().extend({
  classId: z.coerce.number().int().positive('classId must be a valid positive integer.').optional(),
});

const createStudentSchema = z.object({
  student: studentPayloadSchema.optional(),
  parent: parentSchema.optional(),
}).passthrough().superRefine((data, ctx) => {
  const payload = data.student || data;
  const result = studentPayloadSchema.safeParse(payload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue(issue);
    }
  }

  const parentPayload = data.parent || payload.parent;
  const parentResult = parentSchema.safeParse(parentPayload);
  if (!parentResult.success) {
    for (const issue of parentResult.error.issues) {
      ctx.addIssue(issue);
    }
  }

  if (!payload.faceImageBase64) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['faceImageBase64'],
      message: 'faceImageBase64 is required.',
    });
  }
});

const updateStudentSchema = z.object({
  parent: parentSchema.partial().optional(),
}).passthrough().superRefine((data, ctx) => {
  const result = studentUpdatePayloadSchema.safeParse(data);
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
  createStudentSchema,
  updateStudentSchema,
  idParamSchema,
};
