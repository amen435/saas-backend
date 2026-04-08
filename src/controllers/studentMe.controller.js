const prisma = require('../config/database');

/**
 * GET /api/students/me
 * Returns the logged-in student's profile info (class + school).
 */
const getMyStudentProfile = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;

    const student = await prisma.student.findFirst({
      where: { userId: String(userId), schoolId },
      include: {
        user: {
          select: { fullName: true, userId: true },
        },
        class: {
          select: { classId: true, className: true, academicYear: true, section: true },
        },
        school: {
          select: { schoolName: true },
        },
      },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student record not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.studentId,
        fullName: student.user?.fullName ?? null,
        classId: student.class?.classId ?? null,
        className: student.class?.className ?? null,
        academicYear: student.class?.academicYear ?? null,
        schoolName: student.school?.schoolName ?? null,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Get my student profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch student profile',
    });
  }
};

module.exports = {
  getMyStudentProfile,
};

