// src/utils/validation.js

/**
 * Validate subject data
 */
const validateSubjectData = (data) => {
  const errors = [];

  if (!data.subjectName || data.subjectName.trim() === '') {
    errors.push('Subject name is required');
  }

  if (data.subjectName && data.subjectName.length > 200) {
    errors.push('Subject name must be less than 200 characters');
  }

  if (!data.subjectCode || data.subjectCode.trim() === '') {
    errors.push('Subject code is required');
  }

  if (data.subjectCode && data.subjectCode.length > 50) {
    errors.push('Subject code must be less than 50 characters');
  }

  if (data.subjectCode && !/^[A-Z0-9-_]+$/i.test(data.subjectCode)) {
    errors.push('Subject code can only contain letters, numbers, hyphens, and underscores');
  }

  if (data.description && data.description.length > 1000) {
    errors.push('Description must be less than 1000 characters');
  }

  return errors;
};

/**
 * Sanitize subject input
 */
const sanitizeSubjectData = (data) => {
  return {
    subjectName: data.subjectName?.trim(),
    subjectCode: data.subjectCode?.trim().toUpperCase(),
    description: data.description?.trim() || null,
  };
};

module.exports = {
  validateSubjectData,
  sanitizeSubjectData,
};