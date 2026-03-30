// src/controllers/timetable.controller.js

const timetableService = require('../services/timetable.service');
const { validateTimetableData } = require('../utils/timetableValidation');

/**
 * @route   POST /api/timetable
 * @desc    Create timetable entry
 * @access  SCHOOL_ADMIN
 */
const createTimetable = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const data = req.body;

    const errors = validateTimetableData(data);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    const timetable = await timetableService.createTimetable(data, schoolId, userId);

    res.status(201).json({
      success: true,
      message: 'Timetable entry created successfully',
      data: timetable,
    });
  } catch (error) {
    console.error('Create timetable error:', error);

    if (error.message.includes('not found') || error.message.includes('not configured')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message === 'Timetable conflicts detected') {
      return res.status(409).json({
        success: false,
        error: error.message,
        conflicts: error.conflicts,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create timetable entry',
    });
  }
};

/**
 * @route   GET /api/timetable/class/:classId
 * @desc    Get formatted timetable for a class
 * @access  All authenticated users
 */
const getTimetableByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { schoolId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    const timetable = await timetableService.getTimetableByClass(
      parseInt(classId),
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    console.error('Get class timetable error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch class timetable',
    });
  }
};

/**
 * @route   GET /api/timetable/teacher/:teacherId
 * @desc    Get formatted timetable for a teacher
 * @access  SCHOOL_ADMIN, TEACHER
 */
const getTimetableByTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { schoolId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    const timetable = await timetableService.getTimetableByTeacher(
      parseInt(teacherId),
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    console.error('Get teacher timetable error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teacher timetable',
    });
  }
};

/**
 * @route   GET /api/timetable/periods
 * @desc    Get period and break configurations
 * @access  All authenticated users
 */
const getPeriodConfigurations = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    const config = await timetableService.getPeriodConfigurations(schoolId, academicYear);

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Get period config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch period configurations',
    });
  }
};

/**
 * @route   PUT /api/timetable/:id
 * @desc    Update timetable entry
 * @access  SCHOOL_ADMIN
 */
const updateTimetable = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;
    const data = req.body;

    const updated = await timetableService.updateTimetable(
      parseInt(id),
      data,
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Timetable entry updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update timetable error:', error);

    if (error.message === 'Timetable entry not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message === 'Timetable conflicts detected') {
      return res.status(409).json({
        success: false,
        error: error.message,
        conflicts: error.conflicts,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update timetable entry',
    });
  }
};

/**
 * @route   DELETE /api/timetable/:id
 * @desc    Delete timetable entry
 * @access  SCHOOL_ADMIN
 */
const deleteTimetable = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    const result = await timetableService.deleteTimetable(parseInt(id), schoolId);

    res.status(200).json({
      success: true,
      message: 'Timetable entry deleted successfully',
      data: result,
    });
  } catch (error) {
    console.error('Delete timetable error:', error);

    if (error.message === 'Timetable entry not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete timetable entry',
    });
  }
};

module.exports = {
  createTimetable,
  getTimetableByClass,
  getTimetableByTeacher,
  getPeriodConfigurations,
  updateTimetable,
  deleteTimetable,
};