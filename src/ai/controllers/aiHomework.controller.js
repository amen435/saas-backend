// src/ai/controllers/aiHomework.controller.js

const aiHomeworkService = require('../services/aiHomework.service');
const prisma = require('../../config/database');

/**
 * @route   POST /api/ai/homework/generate
 * @desc    Generate homework using AI
 * @access  TEACHER, HOMEROOM_TEACHER
 */
const generateHomework = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const {
      subject,
      topic,
      gradeLevel,
      difficulty,
      numberOfQuestions,
      classId,
      subjectId,
      instructions,
    } = req.body;

    // Validation
    const errors = [];
    if (!subject || subject.trim() === '') errors.push('Subject is required');
    if (!topic || topic.trim() === '') errors.push('Topic is required');
    if (!gradeLevel) errors.push('Grade level is required');
    if (!difficulty) errors.push('Difficulty level is required');

    const validDifficulties = ['EASY', 'MEDIUM', 'HARD', 'ADVANCED'];
    if (difficulty && !validDifficulties.includes(difficulty)) {
      errors.push('Difficulty must be EASY, MEDIUM, HARD, or ADVANCED');
    }

    if (numberOfQuestions && (numberOfQuestions < 1 || numberOfQuestions > 20)) {
      errors.push('Number of questions must be between 1 and 20');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can generate homework',
      });
    }

    // Verify class and subject belong to school if provided
    if (classId) {
      const classData = await prisma.class.findFirst({
        where: { classId: parseInt(classId), schoolId },
      });
      if (!classData) {
        return res.status(404).json({
          success: false,
          error: 'Class not found in this school',
        });
      }
    }

    if (subjectId) {
      const subjectData = await prisma.subject.findFirst({
        where: { subjectId: parseInt(subjectId), schoolId },
      });
      if (!subjectData) {
        return res.status(404).json({
          success: false,
          error: 'Subject not found in this school',
        });
      }
    }

    const homework = await aiHomeworkService.generateHomework(
      teacher.teacherId,
      schoolId,
      {
        subject: subject.trim(),
        topic: topic.trim(),
        gradeLevel: parseInt(gradeLevel),
        difficulty,
        numberOfQuestions: numberOfQuestions || 5,
        classId: classId ? parseInt(classId) : null,
        subjectId: subjectId ? parseInt(subjectId) : null,
        instructions: instructions?.trim() || null,
      }
    );

    res.status(201).json({
      success: true,
      message: 'Homework generated successfully',
      data: homework,
    });
  } catch (error) {
    console.error('Generate homework error:', error);

    if (error.message.includes('not available')) {
      return res.status(503).json({
        success: false,
        error: 'AI service is currently unavailable',
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate homework',
    });
  }
};

/**
 * @route   GET /api/ai/homework
 * @desc    Get all homework created by teacher
 * @access  TEACHER, HOMEROOM_TEACHER
 */
const getTeacherHomework = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { subject, difficulty, classId, isPublished } = req.query;

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can access homework',
      });
    }

    const homework = await aiHomeworkService.getTeacherHomework(
      teacher.teacherId,
      schoolId,
      { subject, difficulty, classId, isPublished }
    );

    res.status(200).json({
      success: true,
      count: homework.length,
      data: homework,
    });
  } catch (error) {
    console.error('Get teacher homework error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch homework',
    });
  }
};

/**
 * @route   GET /api/ai/homework/:id
 * @desc    Get specific homework by ID
 * @access  TEACHER, HOMEROOM_TEACHER
 */
const getHomeworkById = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId, userId } = req.user;

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can access homework',
      });
    }

    const homework = await aiHomeworkService.getHomeworkById(
      parseInt(id),
      teacher.teacherId,
      schoolId
    );

    res.status(200).json({
      success: true,
      data: homework,
    });
  } catch (error) {
    console.error('Get homework by ID error:', error);

    if (error.message === 'Homework not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch homework',
    });
  }
};

/**
 * @route   PUT /api/ai/homework/:id
 * @desc    Update homework
 * @access  TEACHER, HOMEROOM_TEACHER
 */
const updateHomework = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId, userId } = req.user;
    const { topic, instructions, isPublished, generatedQuestions, answerKey } = req.body;

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can update homework',
      });
    }

    const updated = await aiHomeworkService.updateHomework(
      parseInt(id),
      teacher.teacherId,
      schoolId,
      { topic, instructions, isPublished, generatedQuestions, answerKey }
    );

    res.status(200).json({
      success: true,
      message: 'Homework updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update homework error:', error);

    if (error.message === 'Homework not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update homework',
    });
  }
};

/**
 * @route   PATCH /api/ai/homework/:id/publish
 * @desc    Publish homework
 * @access  TEACHER, HOMEROOM_TEACHER
 */
const publishHomework = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId, userId } = req.user;

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can publish homework',
      });
    }

    const published = await aiHomeworkService.publishHomework(
      parseInt(id),
      teacher.teacherId,
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Homework published successfully',
      data: published,
    });
  } catch (error) {
    console.error('Publish homework error:', error);

    if (error.message === 'Homework not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to publish homework',
    });
  }
};

/**
 * @route   DELETE /api/ai/homework/:id
 * @desc    Delete homework
 * @access  TEACHER, HOMEROOM_TEACHER
 */
const deleteHomework = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId, userId } = req.user;

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can delete homework',
      });
    }

    const deleted = await aiHomeworkService.deleteHomework(
      parseInt(id),
      teacher.teacherId,
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Homework deleted successfully',
      data: deleted,
    });
  } catch (error) {
    console.error('Delete homework error:', error);

    if (error.message === 'Homework not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete homework',
    });
  }
};

/**
 * @route   POST /api/ai/homework/:id/regenerate
 * @desc    Regenerate specific questions
 * @access  TEACHER, HOMEROOM_TEACHER
 */
const regenerateQuestions = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId, userId } = req.user;
    const { questionNumbers } = req.body;

    if (!questionNumbers || !Array.isArray(questionNumbers) || questionNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Question numbers array is required',
      });
    }

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can regenerate questions',
      });
    }

    const updated = await aiHomeworkService.regenerateQuestions(
      parseInt(id),
      teacher.teacherId,
      schoolId,
      questionNumbers
    );

    res.status(200).json({
      success: true,
      message: `${questionNumbers.length} question(s) regenerated successfully`,
      data: updated,
    });
  } catch (error) {
    console.error('Regenerate questions error:', error);

    if (error.message === 'Homework not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes('not available')) {
      return res.status(503).json({
        success: false,
        error: 'AI service is currently unavailable',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to regenerate questions',
    });
  }
};

/**
 * @route   GET /api/ai/homework/stats
 * @desc    Get homework generation statistics
 * @access  TEACHER, HOMEROOM_TEACHER
 */
const getHomeworkStats = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can access homework statistics',
      });
    }

    const total = await prisma.aiHomework.count({
      where: {
        teacherId: teacher.teacherId,
        schoolId,
      },
    });

    const published = await prisma.aiHomework.count({
      where: {
        teacherId: teacher.teacherId,
        schoolId,
        isPublished: true,
      },
    });

    const byDifficulty = await prisma.aiHomework.groupBy({
      by: ['difficulty'],
      where: {
        teacherId: teacher.teacherId,
        schoolId,
      },
      _count: true,
    });

    const bySubject = await prisma.aiHomework.groupBy({
      by: ['subjectName'],
      where: {
        teacherId: teacher.teacherId,
        schoolId,
      },
      _count: true,
    });

    const recent = await prisma.aiHomework.findMany({
      where: {
        teacherId: teacher.teacherId,
        schoolId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
      select: {
        homeworkId: true,
        topic: true,
        subjectName: true,
        difficulty: true,
        isPublished: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        total,
        published,
        draft: total - published,
        byDifficulty: byDifficulty.map(d => ({
          difficulty: d.difficulty,
          count: d._count,
        })),
        bySubject: bySubject.map(s => ({
          subject: s.subjectName,
          count: s._count,
        })),
        // Keep a `subject` key for frontend convenience.
        recent: recent.map(r => ({ ...r, subject: r.subjectName || null })),
      },
    });
  } catch (error) {
    console.error('Get homework stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch homework statistics',
    });
  }
};

/**
 * @route   GET /api/ai/homework/class/:classId
 * @desc    Get published homework for a class
 * @access  TEACHER, HOMEROOM_TEACHER, STUDENT, PARENT
 */
const getClassHomework = async (req, res) => {
  try {
    const { classId } = req.params;
    const { schoolId, userId } = req.user;
    const role = req.user.activeRole || req.user.role;
    const { subject } = req.query;
    const classIdNum = parseInt(classId, 10);

    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: {
        classId: classIdNum,
        schoolId,
      },
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found in this school',
      });
    }

    if (role === 'STUDENT') {
      const student = await prisma.student.findFirst({
        where: { userId, schoolId },
        select: { classId: true },
      });
      if (!student || student.classId !== classIdNum) {
        return res.status(403).json({
          success: false,
          error: 'You can only view homework for your class',
        });
      }
    }

    if (role === 'PARENT') {
      const parent = await prisma.parent.findFirst({
        where: { userId, schoolId },
        select: { parentId: true },
      });
      if (!parent) {
        return res.status(403).json({
          success: false,
          error: 'Parent record not found',
        });
      }
      const linkedChildInClass = await prisma.parentStudent.findFirst({
        where: {
          parentId: parent.parentId,
          student: {
            schoolId,
            classId: classIdNum,
          },
        },
        select: { id: true },
      });
      if (!linkedChildInClass) {
        return res.status(403).json({
          success: false,
          error: 'No linked child in this class',
        });
      }
    }

    const where = {
      classId: classIdNum,
      schoolId,
      isPublished: true,
    };

    if (subject) {
      // Filter by stored subjectName (when generated by AI) or fallback to subject relation.
      where.subjectName = { contains: subject };
    }

    const homework = await prisma.aiHomework.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        homeworkId: true,
        topic: true,
        subjectName: true,
        difficulty: true,
        numberOfQuestions: true,
        instructions: true,
        createdAt: true,
        teacher: {
          select: {
            user: {
              select: {
                fullName: true,
              },
            },
          },
        },
        subject: {
          select: {
            subjectName: true,
          },
        },
        // Don't expose answer key to students
        generatedQuestions: true,
      },
    });

    const stripForLearner = role === 'STUDENT' || role === 'PARENT';

    let targetStudentId = null;
    if (role === 'STUDENT') {
      const st = await prisma.student.findFirst({
        where: { userId, schoolId },
        select: { studentId: true },
      });
      targetStudentId = st?.studentId ?? null;
    } else if (role === 'PARENT') {
      const raw = req.query.forStudentId;
      if (!raw) {
        return res.status(400).json({
          success: false,
          error: 'forStudentId query parameter is required for parents',
        });
      }
      targetStudentId = parseInt(raw, 10);
      if (Number.isNaN(targetStudentId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid forStudentId',
        });
      }
      const parent = await prisma.parent.findFirst({
        where: { userId, schoolId },
        select: { parentId: true },
      });
      if (!parent) {
        return res.status(403).json({
          success: false,
          error: 'Parent record not found',
        });
      }
      const link = await prisma.parentStudent.findFirst({
        where: {
          parentId: parent.parentId,
          studentId: targetStudentId,
          student: { schoolId, classId: classIdNum },
        },
        select: { id: true },
      });
      if (!link) {
        return res.status(403).json({
          success: false,
          error: 'Student is not linked to this parent for this class',
        });
      }
    }

    const homeworkIds = homework.map((h) => h.homeworkId);
    let submissionRows = [];
    if (targetStudentId && homeworkIds.length > 0) {
      submissionRows = await prisma.aiHomeworkSubmission.findMany({
        where: {
          studentId: targetStudentId,
          homeworkId: { in: homeworkIds },
        },
      });
    }
    const subByHw = new Map(submissionRows.map((s) => [s.homeworkId, s]));

    // Keep existing frontend contract: `subject` is a string. Students/parents never receive teacher instructions / prompts.
    const mapped = homework.map((h) => {
      const row = {
        ...h,
        subject: h.subjectName || h.subject?.subjectName || null,
      };
      if (stripForLearner) {
        delete row.instructions;
      }
      const sub = targetStudentId ? subByHw.get(h.homeworkId) : null;
      row.submission = sub
        ? {
            status: sub.status,
            submittedAt: sub.submittedAt,
            answers: sub.answers,
          }
        : null;
      return row;
    });

    res.status(200).json({
      success: true,
      count: mapped.length,
      data: mapped,
    });
  } catch (error) {
    console.error('Get class homework error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch class homework',
    });
  }
};

/**
 * @route   POST /api/ai/homework/submissions
 * @desc    Save or submit student homework answers
 * @access  STUDENT
 */
const saveStudentSubmission = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const role = req.user.activeRole || req.user.role;
    if (role !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        error: 'Only students can save homework submissions',
      });
    }

    const { homeworkId, answers, status } = req.body;
    const validStatus = ['DRAFT', 'SUBMITTED'];
    if (homeworkId == null || !validStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'homeworkId and status (DRAFT or SUBMITTED) are required',
      });
    }

    const student = await prisma.student.findFirst({
      where: { userId, schoolId },
      select: { studentId: true, classId: true },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found',
      });
    }

    const hw = await prisma.aiHomework.findFirst({
      where: {
        homeworkId: parseInt(homeworkId, 10),
        schoolId,
        isPublished: true,
        classId: student.classId,
      },
    });

    if (!hw) {
      return res.status(404).json({
        success: false,
        error: 'Homework not found or not available for your class',
      });
    }

    const existing = await prisma.aiHomeworkSubmission.findUnique({
      where: {
        homeworkId_studentId: {
          homeworkId: hw.homeworkId,
          studentId: student.studentId,
        },
      },
    });

    if (existing?.status === 'SUBMITTED') {
      return res.status(400).json({
        success: false,
        error: 'This homework was already submitted and cannot be changed',
      });
    }

    const submittedAt = status === 'SUBMITTED' ? new Date() : null;

    const saved = await prisma.aiHomeworkSubmission.upsert({
      where: {
        homeworkId_studentId: {
          homeworkId: hw.homeworkId,
          studentId: student.studentId,
        },
      },
      create: {
        homeworkId: hw.homeworkId,
        studentId: student.studentId,
        schoolId,
        answers: answers != null ? answers : {},
        status,
        submittedAt,
      },
      update: {
        ...(answers !== undefined && answers !== null ? { answers } : {}),
        status,
        submittedAt: status === 'SUBMITTED' ? new Date() : existing?.submittedAt,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        submissionId: saved.submissionId,
        homeworkId: saved.homeworkId,
        status: saved.status,
        submittedAt: saved.submittedAt,
        answers: saved.answers,
      },
    });
  } catch (error) {
    console.error('Save submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save submission',
    });
  }
};

/**
 * @route   GET /api/ai/homework/:id/submissions
 * @desc    List all student submissions for one homework
 * @access  TEACHER, HOMEROOM_TEACHER
 */
const listHomeworkSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId, userId } = req.user;
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
      select: { teacherId: true },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can view submissions',
      });
    }

    const hw = await prisma.aiHomework.findFirst({
      where: {
        homeworkId: parseInt(id, 10),
        teacherId: teacher.teacherId,
        schoolId,
      },
    });

    if (!hw) {
      return res.status(404).json({
        success: false,
        error: 'Homework not found',
      });
    }

    const rows = await prisma.aiHomeworkSubmission.findMany({
      where: { homeworkId: hw.homeworkId },
      include: {
        student: {
          include: {
            user: {
              select: { fullName: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const data = rows.map((r) => ({
      submissionId: r.submissionId,
      studentId: r.studentId,
      studentName: r.student.user?.fullName || `Student #${r.studentId}`,
      status: r.status,
      submittedAt: r.submittedAt,
      answers: r.answers,
      updatedAt: r.updatedAt,
    }));

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('List submissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list submissions',
    });
  }
};

module.exports = {
  generateHomework,
  getTeacherHomework,
  getHomeworkById,
  updateHomework,
  publishHomework,
  deleteHomework,
  regenerateQuestions,
  getHomeworkStats,
  getClassHomework,
  saveStudentSubmission,
  listHomeworkSubmissions,
};
