// src/utils/rankingUtils.js

const prisma = require('../config/database');

/**
 * Calculate and update rankings for a class-subject combination
 */
async function calculateAndUpdateRankings(classId, subjectId, teacherId, academicYear, schoolId) {
  try {
    // Get all student grades for this class-subject-teacher-year
    const grades = await prisma.studentGrade.findMany({
      where: {
        classId,
        subjectId,
        teacherId,
        academicYear,
        schoolId,
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: {
        totalScore: 'desc', // Order by score descending
      },
    });

    if (grades.length === 0) {
      return { success: true, message: 'No grades to rank' };
    }

    // Calculate ranks
    let currentRank = 1;
    let previousScore = null;
    let studentsWithSameScore = 0;

    const updates = [];

    for (let i = 0; i < grades.length; i++) {
      const grade = grades[i];
      const currentScore = grade.totalScore;

      if (previousScore !== null && currentScore < previousScore) {
        // Score changed, update rank
        currentRank += studentsWithSameScore;
        studentsWithSameScore = 1;
      } else if (previousScore !== null && currentScore === previousScore) {
        // Same score, same rank
        studentsWithSameScore++;
      } else {
        // First student
        studentsWithSameScore = 1;
      }

      // Update rank if it changed
      if (grade.rank !== currentRank) {
        updates.push(
          prisma.studentGrade.update({
            where: { gradeId: grade.gradeId },
            data: { rank: currentRank },
          })
        );
      }

      previousScore = currentScore;
    }

    // Execute all updates
    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return {
      success: true,
      message: 'Rankings updated successfully',
      totalStudents: grades.length,
      updatedRanks: updates.length,
    };
  } catch (error) {
    console.error('Ranking calculation error:', error);
    throw error;
  }
}

/**
 * Get rank for a specific student
 */
async function getStudentRank(studentId, classId, subjectId, teacherId, academicYear, schoolId) {
  const studentGrade = await prisma.studentGrade.findFirst({
    where: {
      studentId,
      classId,
      subjectId,
      teacherId,
      academicYear,
      schoolId,
    },
  });

  if (!studentGrade) {
    return null;
  }

  // Get total students in the same class-subject
  const totalStudents = await prisma.studentGrade.count({
    where: {
      classId,
      subjectId,
      teacherId,
      academicYear,
      schoolId,
    },
  });

  return {
    rank: studentGrade.rank,
    totalStudents,
    totalScore: studentGrade.totalScore,
    percentage: studentGrade.percentage,
    status: studentGrade.status,
  };
}

/**
 * Get class rankings
 */
async function getClassRankings(classId, subjectId, teacherId, academicYear, schoolId) {
  const grades = await prisma.studentGrade.findMany({
    where: {
      classId,
      subjectId,
      teacherId,
      academicYear,
      schoolId,
    },
    include: {
      student: {
        include: {
          user: {
            select: {
              userId: true,
              fullName: true,
            },
          },
        },
      },
    },
    orderBy: [
      { rank: 'asc' },
      { totalScore: 'desc' },
    ],
  });

  return grades.map(grade => ({
    rank: grade.rank,
    studentId: grade.studentId,
    studentName: grade.student.user.fullName,
    userId: grade.student.user.userId,
    totalScore: grade.totalScore,
    percentage: grade.percentage,
    status: grade.status,
  }));
}

module.exports = {
  calculateAndUpdateRankings,
  getStudentRank,
  getClassRankings,
};