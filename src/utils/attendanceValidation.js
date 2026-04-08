// src/utils/attendanceValidation.js

/**
 * Validate attendance data
 */
const validateAttendanceData = (data) => {
  const errors = [];

  if (!data.studentId) {
    errors.push('Student ID is required');
  }

  if (!data.classId) {
    errors.push('Class ID is required');
  }

  if (!data.attendanceDate) {
    errors.push('Attendance date is required');
  }

  if (!data.status) {
    errors.push('Attendance status is required');
  }

  const validStatuses = ['PRESENT', 'ABSENT', 'LATE'];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.push('Status must be PRESENT, ABSENT, or LATE');
  }

  return errors;
};

/**
 * Validate bulk attendance data
 */
const validateBulkAttendance = (records) => {
  const errors = [];

  if (!Array.isArray(records) || records.length === 0) {
    errors.push('Records must be a non-empty array');
    return errors;
  }

  records.forEach((record, index) => {
    if (!record.studentId) {
      errors.push(`Record ${index + 1}: Student ID is required`);
    }
    if (!record.status) {
      errors.push(`Record ${index + 1}: Status is required`);
    }
  });

  return errors;
};

/**
 * Validate date format
 */
const validateDate = (dateString) => {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

/**
 * Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Check if date is not in the future
 */
const isValidAttendanceDate = (dateString) => {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  return date <= today;
};

module.exports = {
  validateAttendanceData,
  validateBulkAttendance,
  validateDate,
  formatDate,
  isValidAttendanceDate,
};