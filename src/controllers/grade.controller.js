// src/controllers/grade.controller.js

const gradeService = require('../services/grade.service');
const { 
  validateGradeComponent, 
  validateTotalWeight,
  validateStudentMark,
  calculateTotalWeight  // ← ADD THIS
} = require('../utils/gradeValidation');
const {
  getClassRankings: calculateClassRankings,
  getStudentRank,
} = require('../utils/rankingUtils');
const prisma = require('../config/database'); // ← ADD THIS (needed for mark validation)

/**
 * @route   GET /api/grades/components
 * @desc    Get all grade components
 * @access  TEACHER, SCHOOL_ADMIN
 */
const getGradeComponents = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { classId, subjectId, teacherId, academicYear, semester } = req.query;

    if (!classId || !subjectId || !teacherId || !academicYear) {
      return res.status(400).json({
        success: false,
        error: 'classId, subjectId, teacherId, and academicYear are required',
      });
    }

    // eslint-disable-next-line no-console
    console.log("GET /api/grades/components query:", { classId, subjectId, teacherId, academicYear });

    const result = await gradeService.getGradeComponents(
      schoolId,
      parseInt(classId),
      parseInt(subjectId),
      parseInt(teacherId),
      academicYear
    );

    // eslint-disable-next-line no-console
    console.log("GET /api/grades/components result count:", result?.components?.length ?? 0);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get grade components error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch grade components',
    });
  }
};

// src/controllers/grade.controller.js

/**
 * @route   POST /api/grades/components
 * @desc    Create grade component
 * @access  TEACHER, SCHOOL_ADMIN
 */
const createGradeComponent = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const data = req.body;

    // eslint-disable-next-line no-console
    console.log("POST /api/grades/components body:", data);

    // Validate input
    const errors = validateGradeComponent(data);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    // Normalize types coming from the frontend (often strings).
    const normalized = {
      ...data,
      classId: parseInt(data.classId),
      subjectId: parseInt(data.subjectId),
      teacherId: parseInt(data.teacherId),
      weight: parseFloat(data.weight),
      academicYear: String(data.academicYear).trim(),
      description: data.description ?? null,
    };

    if (
      !Number.isFinite(normalized.classId) ||
      !Number.isFinite(normalized.subjectId) ||
      !Number.isFinite(normalized.teacherId) ||
      !Number.isFinite(normalized.weight)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid numeric fields in request body",
      });
    }

    // Get existing components to check total weight
    const existing = await gradeService.getGradeComponents(
      schoolId,
      normalized.classId,
      normalized.subjectId,
      normalized.teacherId,
      normalized.academicYear
    );

    // Calculate what the new total would be
    const currentTotal = existing.totalWeight;
    const newTotal = currentTotal + normalized.weight;

    // Check if new total exceeds 100
    const EPS = 0.0001;
    if (newTotal > 100 + EPS) {
      return res.status(400).json({
        success: false,
        error: `Cannot add component. Total weight would be ${newTotal.toFixed(2)}%. Maximum is 100%.`,
        details: {
          currentTotal: currentTotal,
          newWeight: normalized.weight,
          newTotal: newTotal,
          remaining: 100 - currentTotal,
          message: `You can only add up to ${(100 - currentTotal).toFixed(2)}% more weight`
        },
      });
    }

    const component = await gradeService.createGradeComponent(normalized, schoolId);
    // eslint-disable-next-line no-console
    console.log("POST /api/grades/components created:", component);

    // Calculate new total after creation
    const updatedTotal = currentTotal + normalized.weight;

    res.status(201).json({
      success: true,
      message: 'Grade component created successfully',
      data: component,
      weightInfo: {
        componentWeight: normalized.weight,
        totalWeight: updatedTotal,
        remaining: 100 - updatedTotal,
        isComplete: Math.abs(updatedTotal - 100) < 0.01
      }
    });
  } catch (error) {
    console.error('Create grade component error:', error);
    
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'Component with this name already exists',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create grade component',
    });
  }
};

/**
 * @route   PUT /api/grades/components/:id
 * @desc    Update grade component
 * @access  TEACHER, SCHOOL_ADMIN
 */
const updateGradeComponent = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;
    const data = req.body;

    // eslint-disable-next-line no-console
    console.log("PUT /api/grades/components/:id", { id, body: data });

    // Validate input
    const errors = validateGradeComponent(data);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    // Normalize types coming from the frontend (often strings).
    const normalized = {
      ...data,
      classId: parseInt(data.classId),
      subjectId: parseInt(data.subjectId),
      teacherId: parseInt(data.teacherId),
      weight: parseFloat(data.weight),
      academicYear: String(data.academicYear).trim(),
      description: data.description ?? null,
    };

    if (
      !Number.isFinite(normalized.classId) ||
      !Number.isFinite(normalized.subjectId) ||
      !Number.isFinite(normalized.teacherId) ||
      !Number.isFinite(normalized.weight)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid numeric fields in request body",
      });
    }

    // Fetch the component first and validate weight using its actual linkage.
    // This avoids false validation failures if the frontend sends mismatched IDs/academicYear.
    const existingComponent = await prisma.gradeComponent.findFirst({
      where: {
        componentId: parseInt(id),
        schoolId,
      },
    });

    if (!existingComponent) {
      return res.status(404).json({
        success: false,
        error: "Grade component not found",
      });
    }

    // Get existing components for this component's class/subject/teacher/year context
    const existing = await gradeService.getGradeComponents(
      schoolId,
      existingComponent.classId,
      existingComponent.subjectId,
      existingComponent.teacherId,
      existingComponent.academicYear
    );

    // Calculate total weight excluding the component being updated
    const currentTotalWithoutThis = calculateTotalWeight(
      existing.components,
      parseInt(id)
    );

    const newTotal = currentTotalWithoutThis + normalized.weight;

    // Check if new total exceeds 100
    const EPS = 0.0001;
    if (newTotal > 100 + EPS) {
      return res.status(400).json({
        success: false,
        error: `Cannot update component. Total weight would be ${newTotal.toFixed(2)}%. Maximum is 100%.`,
        details: {
          currentTotalWithoutThis: currentTotalWithoutThis,
          newWeight: normalized.weight,
          newTotal: newTotal,
          remaining: 100 - currentTotalWithoutThis,
          message: `You can only set weight up to ${(100 - currentTotalWithoutThis).toFixed(2)}%`
        },
      });
    }

    const component = await gradeService.updateGradeComponent(parseInt(id), normalized, schoolId);
    // eslint-disable-next-line no-console
    console.log("PUT /api/grades/components updated:", component);

    res.status(200).json({
      success: true,
      message: 'Grade component updated successfully',
      data: component,
      weightInfo: {
        componentWeight: normalized.weight,
        totalWeight: newTotal,
        remaining: 100 - newTotal,
        isComplete: Math.abs(newTotal - 100) < 0.01
      }
    });
  } catch (error) {
    console.error('Update grade component error:', error);

    if (error.message === 'Grade component not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update grade component',
    });
  }
};

/**
 * @route   POST /api/grades/marks
 * @desc    Enter student mark
 * @access  TEACHER, SCHOOL_ADMIN
 */
const enterStudentMark = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { studentId, componentId, marksObtained, remarks } = req.body;

    // eslint-disable-next-line no-console
    console.log("POST /api/grades/marks body:", { studentId, componentId, marksObtained, remarks });

    if (!studentId || !componentId || marksObtained === undefined) {
      return res.status(400).json({
        success: false,
        error: 'studentId, componentId, and marksObtained are required',
      });
    }

    // Get component to validate marks
    const component = await prisma.gradeComponent.findFirst({
      where: {
        componentId: parseInt(componentId),
        schoolId,
      },
    });

    if (!component) {
      return res.status(404).json({
        success: false,
        error: 'Grade component not found',
      });
    }

    // Validate marks
    const markErrors = validateStudentMark(marksObtained, component.weight);
    if (markErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: markErrors.join(', '),
      });
    }

    const mark = await gradeService.enterStudentMark({
      studentId: parseInt(studentId),
      componentId: parseInt(componentId),
      marksObtained: parseFloat(marksObtained),
      remarks,
    }, schoolId);

    res.status(201).json({
      success: true,
      message: 'Mark entered successfully',
      data: mark,
    });
  } catch (error) {
    console.error('Enter student mark error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to enter mark',
    });
  }
};

/**
 * @route   GET /api/grades/student/:studentId
 * @desc    Get student grade details
 * @access  TEACHER, STUDENT, PARENT, SCHOOL_ADMIN
 */
const getStudentGrade = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId } = req.user;
    const { classId, subjectId, teacherId, academicYear } = req.query;

    if (!classId || !subjectId || !teacherId || !academicYear) {
      return res.status(400).json({
        success: false,
        error: 'classId, subjectId, teacherId, and academicYear are required',
      });
    }

    const result = await gradeService.getStudentGradeDetails(
      parseInt(studentId),
      parseInt(classId),
      parseInt(subjectId),
      parseInt(teacherId),
      academicYear,
      schoolId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get student grade error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch student grade',
    });
  }
};

/**
 * @route   GET /api/grades/class-report
 * @desc    Get class grade report
 * @access  TEACHER, SCHOOL_ADMIN
 */
const getClassGradeReport = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { classId, subjectId, teacherId, academicYear } = req.query;

    if (!classId || !subjectId || !teacherId || !academicYear) {
      return res.status(400).json({
        success: false,
        error: 'classId, subjectId, teacherId, and academicYear are required',
      });
    }

    const result = await gradeService.getClassGradeReport(
      parseInt(classId),
      parseInt(subjectId),
      parseInt(teacherId),
      academicYear,
      schoolId,
      semester
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get class grade report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch class grade report',
    });
  }
};

/**
 * @route   GET /api/grades/rankings
 * @desc    Get class rankings
 * @access  TEACHER, SCHOOL_ADMIN
 */
const getClassRankings = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { classId, subjectId, teacherId, academicYear } = req.query;

    if (!classId || !subjectId || !teacherId || !academicYear) {
      return res.status(400).json({
        success: false,
        error: 'classId, subjectId, teacherId, and academicYear are required',
      });
    }

    const rankings = await calculateClassRankings(
      parseInt(classId),
      parseInt(subjectId),
      parseInt(teacherId),
      academicYear,
      schoolId
    );

    res.status(200).json({
      success: true,
      count: rankings.length,
      data: rankings,
    });
  } catch (error) {
    console.error('Get rankings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rankings',
    });
  }
};

/**
 * @route   GET /api/grades/overall-rankings
 * @desc    Get overall class rankings across subjects for an academic year
 * @access  TEACHER, SCHOOL_ADMIN
 */
const getOverallClassRankings = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { classId, academicYear, semester } = req.query;

    if (!classId || !academicYear) {
      return res.status(400).json({
        success: false,
        error: 'classId and academicYear are required',
      });
    }

    const rankings = await gradeService.getOverallClassRankings(
      parseInt(classId, 10),
      academicYear,
      schoolId,
      semester
    );

    res.status(200).json({
      success: true,
      count: rankings.length,
      data: rankings,
    });
  } catch (error) {
    console.error('Get overall rankings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch overall rankings',
    });
  }
};

const getOverallSchoolRankings = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { academicYear, semester } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'academicYear is required',
      });
    }

    const rankings = await gradeService.getOverallSchoolRankings(
      academicYear,
      schoolId,
      semester
    );

    res.status(200).json({
      success: true,
      count: rankings.length,
      data: rankings,
    });
  } catch (error) {
    console.error('Get overall school rankings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch overall school rankings',
    });
  }
};


// src/controllers/grade.controller.js

// ... (keep existing code)

/**
 * @route   DELETE /api/grades/components/:id
 * @desc    Delete grade component (hard delete - no marks allowed)
 * @access  TEACHER, SCHOOL_ADMIN
 */
const deleteGradeComponent = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    const result = await gradeService.deleteGradeComponent(parseInt(id), schoolId);

    res.status(200).json({
      success: true,
      message: 'Grade component deleted successfully',
      data: result,
    });
  } catch (error) {
    console.error('Delete grade component error:', error);

    if (error.message === 'Grade component not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes('Cannot delete')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        hint: 'Use DELETE /api/grades/components/:id/with-marks to delete component with marks',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete grade component',
      details: error.message,
    });
  }
};

/**
 * @route   PATCH /api/grades/components/:id/deactivate
 * @desc    Soft delete grade component (mark as inactive)
 * @access  TEACHER, SCHOOL_ADMIN
 */
const softDeleteGradeComponent = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    const result = await gradeService.softDeleteGradeComponent(parseInt(id), schoolId);

    res.status(200).json({
      success: true,
      message: 'Grade component deactivated successfully',
      data: result,
    });
  } catch (error) {
    console.error('Soft delete grade component error:', error);

    if (error.message === 'Grade component not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to deactivate grade component',
    });
  }
};

/**
 * @route   DELETE /api/grades/components/:id/marks
 * @desc    Delete all marks for a component (partition delete)
 * @access  TEACHER, SCHOOL_ADMIN
 */
const deleteComponentMarks = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    const result = await gradeService.deleteComponentMarks(parseInt(id), schoolId);

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedMarksCount} marks for component`,
      data: result,
    });
  } catch (error) {
    console.error('Delete component marks error:', error);

    if (error.message === 'Grade component not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete component marks',
    });
  }
};

/**
 * @route   DELETE /api/grades/components/:id/with-marks
 * @desc    Delete component with all its marks (cascade delete)
 * @access  TEACHER, SCHOOL_ADMIN
 */
const deleteComponentWithMarks = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    const result = await gradeService.deleteComponentWithMarks(parseInt(id), schoolId);

    res.status(200).json({
      success: true,
      message: `Component and ${result.deletedMarksCount} marks deleted successfully`,
      data: result,
    });
  } catch (error) {
    console.error('Delete component with marks error:', error);

    if (error.message === 'Grade component not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete component with marks',
    });
  }
};

/**
 * @route   DELETE /api/grades/marks/:markId
 * @desc    Delete individual student mark
 * @access  TEACHER, SCHOOL_ADMIN
 */
const deleteStudentMark = async (req, res) => {
  try {
    const { markId } = req.params;
    const { schoolId } = req.user;

    // Get mark details
    const mark = await prisma.studentMark.findFirst({
      where: {
        markId: parseInt(markId),
        schoolId,
      },
      include: {
        component: true,
      },
    });

    if (!mark) {
      return res.status(404).json({
        success: false,
        error: 'Mark not found',
      });
    }

    // Delete mark
    await prisma.studentMark.delete({
      where: {
        markId: parseInt(markId),
      },
    });

    // Recalculate student's total grade
    await gradeService.calculateStudentTotalGrade(
      mark.studentId,
      mark.classId,
      mark.subjectId,
      mark.component.teacherId,
      mark.academicYear,
      schoolId
    );

    // Update rankings
    const { calculateAndUpdateRankings } = require('../utils/rankingUtils');
    await calculateAndUpdateRankings(
      mark.classId,
      mark.subjectId,
      mark.component.teacherId,
      mark.academicYear,
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Mark deleted successfully',
      data: mark,
    });
  } catch (error) {
    console.error('Delete student mark error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete mark',
    });
  }
};


/**
 * @route   GET /api/grades/student-rank/:studentId
 * @desc    Get student rank
 * @access  TEACHER, STUDENT, PARENT, SCHOOL_ADMIN
 */
const getStudentRankInfo = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId } = req.user;
    const { classId, subjectId, teacherId, academicYear } = req.query;

    if (!classId || !subjectId || !teacherId || !academicYear) {
      return res.status(400).json({
        success: false,
        error: 'classId, subjectId, teacherId, and academicYear are required',
      });
    }

    const rankInfo = await getStudentRank(
      parseInt(studentId),
      parseInt(classId),
      parseInt(subjectId),
      parseInt(teacherId),
      academicYear,
      schoolId
    );

    if (!rankInfo) {
      return res.status(404).json({
        success: false,
        error: 'No grade found for this student',
      });
    }

    res.status(200).json({
      success: true,
      data: rankInfo,
    });
  } catch (error) {
    console.error('Get student rank error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch student rank',
    });
  }
};

/**
 * @route   GET /api/grades/student-summary/:studentId
 * @desc    Get aggregated subject results for a student
 * @access  TEACHER, STUDENT, PARENT, SCHOOL_ADMIN
 */
const getStudentSummary = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId } = req.user;
    const { academicYear, semester } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'academicYear is required',
      });
    }

    console.log("[getStudentSummary] request:", {
      studentId,
      academicYear,
      schoolId,
    });

    // Frontend may pass either:
    // - numeric `studentId` (for Parent dashboard)
    // - student's `userId` string (for Student pages)
    // Backend should resolve the numeric studentId for consistent DB querying.
    const parsedStudentId = parseInt(studentId, 10);
    let resolvedStudentId = Number.isInteger(parsedStudentId) ? parsedStudentId : null;

    if (resolvedStudentId === null) {
      const student = await prisma.student.findFirst({
        where: { userId: String(studentId), schoolId },
        select: { studentId: true },
      });

      if (!student) {
        return res.status(404).json({
          success: false,
          error: 'Student not found for this userId',
        });
      }

      resolvedStudentId = student.studentId;
    }

    let result = await gradeService.getStudentSummary(resolvedStudentId, academicYear, schoolId, semester);
    let usedAcademicYear = academicYear;

    // If the requested academicYear doesn't match DB rows, attempt a safe fallback:
    // Use the student's class academicYear.
    if (!Array.isArray(result?.subjects) || result.subjects.length === 0) {
      const student = await prisma.student.findFirst({
        where: { studentId: resolvedStudentId, schoolId },
        select: {
          class: { select: { academicYear: true } },
        },
      });

      const fallbackYear = student?.class?.academicYear;
      if (fallbackYear && fallbackYear !== academicYear) {
        usedAcademicYear = fallbackYear;
        result = await gradeService.getStudentSummary(resolvedStudentId, fallbackYear, schoolId, semester);
      }
    }

    console.log("[getStudentSummary] response:", {
      subjectsCount: Array.isArray(result?.subjects) ? result.subjects.length : 0,
      average: result?.summary?.average ?? null,
      resolvedStudentId,
      usedAcademicYear,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get student summary error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch student summary',
    });
  }
};

module.exports = {
  getGradeComponents,
  createGradeComponent,
  updateGradeComponent,
  deleteGradeComponent,
  softDeleteGradeComponent,        // ← NEW
  deleteComponentMarks,             // ← NEW
  deleteComponentWithMarks,         // ← NEW
  deleteStudentMark,                // ← NEW
  enterStudentMark,
  getStudentGrade,
  getClassGradeReport,
  getClassRankings,
  getOverallClassRankings,
  getOverallSchoolRankings,
  getStudentRankInfo,
  getStudentSummary,
};
