// src/utils/teacherAttendanceValidation.js

/**
 * Validate teacher attendance data
 */
const validateTeacherAttendanceData = (data) => {
  const errors = [];

  if (!data.teacherId) {
    errors.push('Teacher ID is required');
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
 * Validate bulk teacher attendance data
 */
const validateBulkTeacherAttendance = (records) => {
  const errors = [];

  if (!Array.isArray(records) || records.length === 0) {
    errors.push('Records must be a non-empty array');
    return errors;
  }

  records.forEach((record, index) => {
    if (!record.teacherId) {
      errors.push(`Record ${index + 1}: Teacher ID is required`);
    }
    if (!record.status) {
      errors.push(`Record ${index + 1}: Status is required`);
    }
    const validStatuses = ['PRESENT', 'ABSENT', 'LATE'];
    if (record.status && !validStatuses.includes(record.status)) {
      errors.push(`Record ${index + 1}: Invalid status`);
    }
  });

  return errors;
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

module.exports = {
  validateTeacherAttendanceData,
  validateBulkTeacherAttendance,
  isValidAttendanceDate,
  formatDate,
};