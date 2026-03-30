// src/middleware/homeroom.middleware.js

const prisma = require('../config/database');

/**
 * Verify teacher is homeroom teacher of specified class
 * Usage: Add classId to req.params or req.body
 */
const verifyHomeroomTeacher = async (req, res, next) => {
  try {
    const { schoolId, userId: teacherUserId } = req.user;
    
    // Get classId from params or body
    const classId = req.params.classId || req.body.classId;

    if (!classId) {
      return res.status(400).json({
        success: false,
        error: 'classId is required'
      });
    }

    // Get teacher record
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId,
        isActive: true
      }
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    // Get class and verify homeroom teacher
    const classData = await prisma.class.findFirst({
      where: {
        classId: parseInt(classId),
        schoolId,
        isActive: true
      }
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }

    // Check if teacher is homeroom teacher
    if (classData.homeroomTeacherId !== teacher.teacherId) {
      return res.status(403).json({
        success: false,
        error: 'Only the homeroom teacher of this class can perform this action'
      });
    }

    // Attach teacher and class to request for later use
    req.teacher = teacher;
    req.class = classData;

    next();

  } catch (error) {
    console.error('Homeroom verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify homeroom teacher'
    });
  }
};

/**
 * Verify student belongs to teacher's homeroom class
 */
const verifyStudentInHomeroomClass = async (req, res, next) => {
  try {
    const { schoolId, userId: teacherUserId } = req.user;
    const { studentId } = req.params;

    // Get teacher record
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId
      }
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    // Get student
    const student = await prisma.student.findFirst({
      where: {
        studentId: parseInt(studentId),
        schoolId
      },
      include: {
        class: true
      }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Verify teacher is homeroom of student's class
    if (student.class.homeroomTeacherId !== teacher.teacherId) {
      return res.status(403).json({
        success: false,
        error: 'You can only manage students in your homeroom class'
      });
    }

    // Attach student to request
    req.student = student;
    req.teacher = teacher;

    next();

  } catch (error) {
    console.error('Student verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify student access'
    });
  }
};

module.exports = {
  verifyHomeroomTeacher,
  verifyStudentInHomeroomClass
};