// src/utils/timetableValidation.js

const validateTimetableData = (data) => {
  const errors = [];

  if (!data.classId) errors.push('Class ID is required');
  if (!data.subjectId) errors.push('Subject ID is required');
  if (!data.teacherId) errors.push('Teacher ID is required');
  if (!data.dayOfWeek) errors.push('Day of week is required');
  if (!data.periodNumber) errors.push('Period number is required');
  if (!data.academicYear) errors.push('Academic year is required');

  const validDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  if (data.dayOfWeek && !validDays.includes(data.dayOfWeek)) {
    errors.push('Invalid day of week');
  }

  if (data.periodNumber && (data.periodNumber < 1 || data.periodNumber > 7)) {
    errors.push('Period number must be between 1 and 7');
  }

  return errors;
};

module.exports = { validateTimetableData };