// src/controllers/subject.controller.js

const subjectService = require('../services/subject.service');
const { validateSubjectData, sanitizeSubjectData } = require('../utils/validation');

/**
 * @route   GET /api/subjects
 * @desc    Get all subjects for school
 * @access  SCHOOL_ADMIN, TEACHER
 */
const getAllSubjects = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { search } = req.query;

    const subjects = await subjectService.getAllSubjects(schoolId, { search });

    res.status(200).json({
      success: true,
      count: subjects.length,
      data: subjects,
    });
  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subjects',
    });
  }
};

/**
 * @route   GET /api/subjects/:id
 * @desc    Get single subject
 * @access  SCHOOL_ADMIN, TEACHER
 */
const getSubjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    const subject = await subjectService.getSubjectById(parseInt(id), schoolId);

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found',
      });
    }

    res.status(200).json({
      success: true,
      data: subject,
    });
  } catch (error) {
    console.error('Get subject error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subject',
    });
  }
};

/**
 * @route   POST /api/subjects
 * @desc    Create subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
const createSubject = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const sanitized = sanitizeSubjectData(req.body);

    // Validate
    const errors = validateSubjectData(sanitized);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    const subject = await subjectService.createSubject(sanitized, schoolId);

    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      data: subject,
    });
  } catch (error) {
    console.error('Create subject error:', error);

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create subject',
    });
  }
};

/**
 * @route   PUT /api/subjects/:id
 * @desc    Update subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;
    const sanitized = sanitizeSubjectData(req.body);

    // Validate
    const errors = validateSubjectData(sanitized);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    const subject = await subjectService.updateSubject(parseInt(id), sanitized, schoolId);

    res.status(200).json({
      success: true,
      message: 'Subject updated successfully',
      data: subject,
    });
  } catch (error) {
    console.error('Update subject error:', error);

    if (error.message === 'Subject not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update subject',
    });
  }
};

/**
 * @route   DELETE /api/subjects/:id
 * @desc    Delete subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    await subjectService.deleteSubject(parseInt(id), schoolId);

    res.status(200).json({
      success: true,
      message: 'Subject deleted successfully',
    });
  } catch (error) {
    console.error('Delete subject error:', error);

    if (error.message === 'Subject not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete subject',
    });
  }
};

/**
 * @route   POST /api/subjects/:id/assign-teacher
 * @desc    Assign teacher to subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
const assignTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { teacherId } = req.body;
    const { schoolId } = req.user;

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        error: 'Teacher ID is required',
      });
    }

    const assignment = await subjectService.assignTeacher(
      parseInt(id),
      parseInt(teacherId),
      schoolId
    );

    res.status(201).json({
      success: true,
      message: 'Teacher assigned successfully',
      data: assignment,
    });
  } catch (error) {
    console.error('Assign teacher error:', error);

    if (error.message.includes('not found') || error.message.includes('does not belong')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes('already assigned')) {
      return res.status(409).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to assign teacher',
    });
  }
};

/**
 * @route   DELETE /api/subjects/:id/remove-teacher/:teacherId
 * @desc    Remove teacher from subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
const removeTeacher = async (req, res) => {
  try {
    const { id, teacherId } = req.params;
    const { schoolId } = req.user;

    await subjectService.removeTeacher(parseInt(id), parseInt(teacherId), schoolId);

    res.status(200).json({
      success: true,
      message: 'Teacher removed successfully',
    });
  } catch (error) {
    console.error('Remove teacher error:', error);

    if (error.message.includes('not found') || error.message.includes('not assigned')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to remove teacher',
    });
  }
};

/**
 * @route   GET /api/teachers
 * @desc    Get all teachers for subject assignment
 * @access  SCHOOL_ADMIN
 */
const getSchoolTeachers = async (req, res) => {
  try {
    const { schoolId } = req.user;

    const teachers = await subjectService.getSchoolTeachers(schoolId);

    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers,
    });
  } catch (error) {
    console.error('Get teachers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teachers',
    });
  }
};

module.exports = {
  getAllSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
  assignTeacher,
  removeTeacher,
  getSchoolTeachers,
};