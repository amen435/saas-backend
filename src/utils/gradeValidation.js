// src/utils/gradeValidation.js

/**
 * Validate grade component data
 */
const validateGradeComponent = (data) => {
  const errors = [];

  if (!data.componentName || data.componentName.trim() === '') {
    errors.push('Component name is required');
  }

  if (!data.componentType || data.componentType.trim() === '') {
    errors.push('Component type is required');
  }

  if (data.weight === undefined || data.weight === null) {
    errors.push('Weight is required');
  }

  // FIXED: Allow 0-100 range
  if (data.weight < 0) {
    errors.push('Weight cannot be negative');
  }

  if (data.weight > 100) {
    errors.push('Weight cannot exceed 100%');
  }

  if (!data.classId) {
    errors.push('Class ID is required');
  }

  if (!data.subjectId) {
    errors.push('Subject ID is required');
  }

  if (!data.teacherId) {
    errors.push('Teacher ID is required');
  }

  if (!data.academicYear || data.academicYear.trim() === '') {
    errors.push('Academic year is required');
  }

  return errors;
};

/**
 * Calculate total weight of existing components
 */
const calculateTotalWeight = (components, excludeComponentId = null) => {
  let total = 0;
  
  components.forEach(component => {
    if (!excludeComponentId || component.componentId !== excludeComponentId) {
      total += parseFloat(component.weight);
    }
  });

  return total;
};

/**
 * Validate if adding new weight would exceed 100
 */
const validateTotalWeight = (existingComponents, newWeight, excludeComponentId = null) => {
  const currentTotal = calculateTotalWeight(existingComponents, excludeComponentId);
  const newTotal = currentTotal + parseFloat(newWeight);
  
  return {
    isValid: newTotal <= 100, // FIXED: Allow total up to 100, not just exactly 100
    currentTotal,
    newTotal,
    remaining: 100 - newTotal,
  };
};

/**
 * Check if total weight equals exactly 100 (for completion check)
 */
const isTotalWeightComplete = (totalWeight) => {
  return Math.abs(totalWeight - 100) < 0.01; // Allow tiny floating point errors
};

/**
 * Validate student mark
 */
const validateStudentMark = (marksObtained, componentWeight) => {
  const errors = [];

  if (marksObtained === undefined || marksObtained === null) {
    errors.push('Marks obtained is required');
  }

  if (marksObtained < 0) {
    errors.push('Marks cannot be negative');
  }

  if (marksObtained > componentWeight) {
    errors.push(`Marks cannot exceed component weight (${componentWeight})`);
  }

  return errors;
};

/**
 * Calculate percentage of marks obtained
 */
const calculatePercentage = (marksObtained, componentWeight) => {
  if (componentWeight === 0) return 0;
  return (marksObtained / componentWeight) * 100;
};

/**
 * Calculate total score for a student
 */
const calculateTotalScore = (marks) => {
  return marks.reduce((total, mark) => total + parseFloat(mark.marksObtained), 0);
};

/**
 * Determine pass/fail status
 */
const determineStatus = (totalScore, passMarkPercentage = 50) => {
  return totalScore >= passMarkPercentage ? 'PASS' : 'FAIL';
};

module.exports = {
  validateGradeComponent,
  calculateTotalWeight,
  validateTotalWeight,
  isTotalWeightComplete,
  validateStudentMark,
  calculatePercentage,
  calculateTotalScore,
  determineStatus,
};