// src/routes/admin.student.routes.js
// School Admin - get all students in the school

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');

router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @route   GET /api/admin/students
 * @desc    Get all students in school
 * @query   ?classId=1&isActive=true
 * @access  SCHOOL_ADMIN
 */
router.get('/', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { classId, isActive } = req.query;

    const where = { schoolId };

    if (classId) {
      where.classId = parseInt(classId);
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        user: {
          select: {
            userId: true,
            username: true,
            fullName: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        class: {
          select: {
            classId: true,
            className: true,
            gradeLevel: true,
            section: true,
          },
        },
      },
      orderBy: [
        { class: { gradeLevel: 'asc' } },
        { class: { section: 'asc' } },
        { user: { fullName: 'asc' } },
      ],
    });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    console.error('Get admin students error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students',
    });
  }
});

module.exports = router;
