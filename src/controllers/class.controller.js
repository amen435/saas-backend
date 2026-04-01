// src/controllers/class.controller.js

const prisma = require('../config/database');

/**
 * @route   POST /api/classes
 * @desc    Create a new class
 * @access  SCHOOL_ADMIN only
 */
const createClass = async (req, res) => {
  try {
    const {
      className,
      gradeLevel,
      section,
      academicYear,
      homeroomTeacherId,
      capacity
    } = req.body;

    const { schoolId } = req.user;

    // Validation
    if (!className || !gradeLevel || !academicYear) {
      return res.status(400).json({
        success: false,
        error: 'className, gradeLevel, and academicYear are required'
      });
    }

    // Verify homeroom teacher belongs to same school (if provided)
    if (homeroomTeacherId) {
      const teacher = await prisma.teacher.findFirst({
        where: {
          teacherId: parseInt(homeroomTeacherId),
          schoolId
        }
      });

      if (!teacher) {
        return res.status(400).json({
          success: false,
          error: 'Homeroom teacher not found or does not belong to your school'
        });
      }
    }

    // Create class
    const newClass = await prisma.class.create({
      data: {
        schoolId,
        className,
        gradeLevel: parseInt(gradeLevel),
        section: section || null,
        academicYear,
        homeroomTeacherId: homeroomTeacherId ? parseInt(homeroomTeacherId) : null,
        capacity: capacity ? parseInt(capacity) : null,
        isActive: true
      },
      include: {
        school: {
          select: {
            schoolId: true,
            schoolName: true
          }
        },
        homeroomTeacher: {
          include: {
            user: {
              select: {
                userId: true,
                fullName: true,
                phone: true,
                role: true,
                isActive: true,
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Class created successfully',
      data: newClass
    });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'This grade and section already exist for this academic year'
      });
    }

    console.error('Create class error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create class'
    });
  }
};

/**
 * @route   GET /api/classes
 * @desc    Get all classes for school admin's school
 * @access  SCHOOL_ADMIN only
 */
const getAllClasses = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { gradeLevel, academicYear, isActive } = req.query;

    const where = { schoolId };

    if (gradeLevel) {
      where.gradeLevel = parseInt(gradeLevel);
    }

    if (academicYear) {
      where.academicYear = academicYear;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const classes = await prisma.class.findMany({
      where,
      include: {
        homeroomTeacher: {
          include: {
            user: {
              select: {
                userId: true,
                fullName: true,
                phone: true,
                role: true,
                isActive: true,
              }
            }
          }
        },
        _count: {
          select: {
            classTeachers: true // Number of teachers
          }
        }
      },
      orderBy: [
        { gradeLevel: 'asc' },
        { section: 'asc' }
      ]
    });

    res.status(200).json({
      success: true,
      count: classes.length,
      data: classes
    });

  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch classes'
    });
  }
};

/**
 * @route   GET /api/classes/:classId
 * @desc    Get single class
 * @access  SCHOOL_ADMIN only
 */
const getClassById = async (req, res) => {
  try {
    const { classId } = req.params;
    const { schoolId } = req.user;

    const classData = await prisma.class.findFirst({
      where: {
        classId: parseInt(classId),
        schoolId
      },
      include: {
        school: true,
        homeroomTeacher: {
          include: {
            user: true
          }
        },
        classTeachers: {
          include: {
            teacher: {
              include: {
                user: {
                  select: {
                    fullName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }

    res.status(200).json({
      success: true,
      data: classData
    });

  } catch (error) {
    console.error('Get class error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch class'
    });
  }
};

/**
 * @route   POST /api/classes/:classId/assign-teacher
 * @desc    Assign teacher to class
 * @access  SCHOOL_ADMIN only
 */
const assignTeacherToClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { teacherId, subjectName } = req.body;
    const { schoolId } = req.user;

    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: {
        classId: parseInt(classId),
        schoolId
      }
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }

    // Verify teacher belongs to same school
    const teacher = await prisma.teacher.findFirst({
      where: {
        teacherId: parseInt(teacherId),
        schoolId
      }
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found or does not belong to your school'
      });
    }

    // Assign teacher to class
    const assignment = await prisma.classTeacher.create({
      data: {
        classId: parseInt(classId),
        teacherId: parseInt(teacherId),
        subjectName: subjectName || null
      },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                fullName: true
              }
            }
          }
        },
        class: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Teacher assigned to class successfully',
      data: assignment
    });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'Teacher already assigned to this class for this subject'
      });
    }

    console.error('Assign teacher error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign teacher'
    });
  }
};

/**
 * @route   DELETE /api/classes/:classId/teachers/:teacherId
 * @desc    Remove teacher from class
 * @access  SCHOOL_ADMIN only
 */
const removeTeacherFromClass = async (req, res) => {
  try {
    const { classId, teacherId } = req.params;
    const { schoolId } = req.user;

    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: {
        classId: parseInt(classId),
        schoolId
      }
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }

    // Remove assignment
    await prisma.classTeacher.deleteMany({
      where: {
        classId: parseInt(classId),
        teacherId: parseInt(teacherId)
      }
    });

    res.status(200).json({
      success: true,
      message: 'Teacher removed from class successfully'
    });

  } catch (error) {
    console.error('Remove teacher error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove teacher'
    });
  }
};

/**
 * @route   PUT /api/classes/:classId
 * @desc    Update class
 * @access  SCHOOL_ADMIN only
 */
const updateClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { schoolId } = req.user;
    const { className, homeroomTeacherId, capacity } = req.body;

    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: {
        classId: parseInt(classId),
        schoolId
      }
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }

    // Verify homeroom teacher (if changing)
    if (homeroomTeacherId) {
      const teacher = await prisma.teacher.findFirst({
        where: {
          teacherId: parseInt(homeroomTeacherId),
          schoolId
        }
      });

      if (!teacher) {
        return res.status(400).json({
          success: false,
          error: 'Homeroom teacher not found'
        });
      }
    }

    // Update class
    const updatedClass = await prisma.class.update({
      where: { classId: parseInt(classId) },
      data: {
        className: className || undefined,
        homeroomTeacherId: homeroomTeacherId ? parseInt(homeroomTeacherId) : undefined,
        capacity: capacity ? parseInt(capacity) : undefined
      },
      include: {
        homeroomTeacher: {
          include: {
            user: {
              select: {
                fullName: true
              }
            }
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Class updated successfully',
      data: updatedClass
    });

  } catch (error) {
    console.error('Update class error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update class'
    });
  }
};

module.exports = {
  createClass,
  getAllClasses,
  getClassById,
  assignTeacherToClass,
  removeTeacherFromClass,
  updateClass
};
