// src/services/grade.service.js

const prisma = require('../config/database');
const { 
  calculatePercentage, 
  calculateTotalScore, 
  determineStatus 
} = require('../utils/gradeValidation');
const { calculateAndUpdateRankings } = require('../utils/rankingUtils');

class GradeService {
  normalizeSemester(semester) {
    const value = String(semester || "").trim().toUpperCase();
    if (!value || value === 'ALL') return null;
    if (['1', 'SEMESTER_1', 'SEMESTER1', 'FIRST', 'FIRST_SEMESTER'].includes(value)) {
      return 'SEMESTER_1';
    }
    if (['2', 'SEMESTER_2', 'SEMESTER2', 'SECOND', 'SECOND_SEMESTER'].includes(value)) {
      return 'SEMESTER_2';
    }
    return null;
  }

  getSemesterDateRange(academicYear, semester) {
    const normalizedSemester = this.normalizeSemester(semester);
    if (!normalizedSemester) {
      return null;
    }

    const [rawStartYear] = String(academicYear || '').split(/[/-]/);
    const startYear = parseInt(rawStartYear, 10);
    if (!Number.isInteger(startYear)) {
      return null;
    }

    if (normalizedSemester === 'SEMESTER_1') {
      return {
        start: new Date(Date.UTC(startYear, 8, 1, 0, 0, 0)),
        end: new Date(Date.UTC(startYear + 1, 0, 31, 23, 59, 59, 999)),
      };
    }

    return {
      start: new Date(Date.UTC(startYear + 1, 1, 1, 0, 0, 0)),
      end: new Date(Date.UTC(startYear + 1, 7, 31, 23, 59, 59, 999)),
    };
  }

  buildBestSubjectMap(rows = []) {
    const bestBySubject = new Map();

    for (const row of rows) {
      const key = String(row.subjectId);
      const existing = bestBySubject.get(key);
      if (!existing || Number(row.percentage || 0) > Number(existing.percentage || 0)) {
        bestBySubject.set(key, row);
      }
    }

    return bestBySubject;
  }

  rankLeaderboard(entries = []) {
    const leaderboard = [...entries];

    leaderboard.sort((a, b) => {
      if (Number(b.average) !== Number(a.average)) {
        return Number(b.average) - Number(a.average);
      }
      return String(a.studentName).localeCompare(String(b.studentName));
    });

    let currentRank = 1;
    let previousAverage = null;
    let tiedCount = 0;

    return leaderboard.map((entry, index) => {
      const roundedAverage = Number(Number(entry.average || 0).toFixed(2));
      if (previousAverage !== null && roundedAverage < previousAverage) {
        currentRank += tiedCount;
        tiedCount = 1;
      } else if (previousAverage !== null && roundedAverage === previousAverage) {
        tiedCount += 1;
      } else {
        tiedCount = 1;
      }

      previousAverage = roundedAverage;

      return {
        rank: currentRank,
        studentId: entry.studentId,
        userId: entry.userId,
        studentName: entry.studentName,
        classId: entry.classId ?? null,
        className: entry.className ?? null,
        average: roundedAverage,
        subjectCount: entry.subjectCount,
        subjects: entry.subjects,
        position: index + 1,
      };
    });
  }

  buildOverallLeaderboardFromGradeRows(rows = []) {
    const byStudent = new Map();

    for (const row of rows) {
      const key = String(row.studentId);
      if (!byStudent.has(key)) {
        byStudent.set(key, []);
      }
      byStudent.get(key).push(row);
    }

    const leaderboard = Array.from(byStudent.entries()).map(([studentId, studentRows]) => {
      const bestBySubject = this.buildBestSubjectMap(studentRows);
      const bestSubjects = Array.from(bestBySubject.values());
      const average = bestSubjects.length
        ? bestSubjects.reduce((sum, item) => sum + Number(item.percentage || 0), 0) / bestSubjects.length
        : 0;
      const sample = studentRows[0];

      return {
        studentId: Number(studentId),
        userId: sample?.student?.user?.userId ?? null,
        studentName: sample?.student?.user?.fullName ?? `Student ${studentId}`,
        classId: sample?.classId ?? null,
        className: sample?.class?.className ?? null,
        average,
        subjectCount: bestSubjects.length,
        subjects: bestSubjects.map((item) => ({
          subjectId: item.subjectId,
          subjectName: item.subject?.subjectName ?? `Subject #${item.subjectId}`,
          average: Number(item.percentage || 0),
          status: item.status ?? null,
        })),
      };
    });

    return this.rankLeaderboard(leaderboard);
  }

  buildOverallLeaderboardFromMarkRows(rows = []) {
    const studentSubjectTeacherMap = new Map();

    for (const row of rows) {
      const teacherId = row.component?.teacherId ?? 0;
      const key = `${row.studentId}:${row.subjectId}:${teacherId}`;
      const existing = studentSubjectTeacherMap.get(key) || {
        studentId: row.studentId,
        userId: row.student?.user?.userId ?? null,
        studentName: row.student?.user?.fullName ?? `Student ${row.studentId}`,
        classId: row.classId ?? null,
        className: row.class?.className ?? null,
        subjectId: row.subjectId,
        subjectName: row.subject?.subjectName ?? `Subject #${row.subjectId}`,
        totalPercentage: 0,
      };

      existing.totalPercentage += Number(row.percentage || 0);
      studentSubjectTeacherMap.set(key, existing);
    }

    const byStudent = new Map();
    for (const entry of studentSubjectTeacherMap.values()) {
      const key = String(entry.studentId);
      if (!byStudent.has(key)) {
        byStudent.set(key, []);
      }
      byStudent.get(key).push(entry);
    }

    const leaderboard = Array.from(byStudent.values()).map((studentRows) => {
      const bestBySubject = new Map();

      for (const row of studentRows) {
        const existing = bestBySubject.get(String(row.subjectId));
        if (!existing || Number(row.totalPercentage) > Number(existing.totalPercentage)) {
          bestBySubject.set(String(row.subjectId), row);
        }
      }

      const bestSubjects = Array.from(bestBySubject.values());
      const average = bestSubjects.length
        ? bestSubjects.reduce((sum, item) => sum + Number(item.totalPercentage || 0), 0) / bestSubjects.length
        : 0;
      const sample = studentRows[0];

      return {
        studentId: sample?.studentId ?? null,
        userId: sample?.userId ?? null,
        studentName: sample?.studentName ?? 'Student',
        classId: sample?.classId ?? null,
        className: sample?.className ?? null,
        average,
        subjectCount: bestSubjects.length,
        subjects: bestSubjects.map((item) => ({
          subjectId: item.subjectId,
          subjectName: item.subjectName,
          average: Number(Number(item.totalPercentage || 0).toFixed(2)),
          status: Number(item.totalPercentage || 0) >= 60 ? 'PASS' : 'FAIL',
        })),
      };
    });

    return this.rankLeaderboard(leaderboard);
  }

  async getSemesterMarks(where = {}) {
    return prisma.studentMark.findMany({
      where,
      include: {
        component: {
          select: {
            teacherId: true,
            createdAt: true,
          },
        },
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
        subject: {
          select: {
            subjectId: true,
            subjectName: true,
          },
        },
        class: {
          select: {
            classId: true,
            className: true,
          },
        },
      },
    });
  }

  async getOverallClassRankings(classId, academicYear, schoolId, semester = null) {
    const semesterRange = this.getSemesterDateRange(academicYear, semester);

    if (semesterRange) {
      const rows = await this.getSemesterMarks({
        classId,
        academicYear,
        schoolId,
        component: {
          is: {
            createdAt: {
              gte: semesterRange.start,
              lte: semesterRange.end,
            },
          },
        },
      });

      return this.buildOverallLeaderboardFromMarkRows(rows).map((entry) => ({
        ...entry,
        classRank: entry.rank,
        averageScore: entry.average,
      }));
    }

    const rows = await prisma.studentGrade.findMany({
      where: {
        classId,
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
        subject: {
          select: {
            subjectId: true,
            subjectName: true,
          },
        },
        class: {
          select: {
            classId: true,
            className: true,
          },
        },
      },
    });

    return this.buildOverallLeaderboardFromGradeRows(rows).map((entry) => ({
      ...entry,
      classRank: entry.rank,
      averageScore: entry.average,
    }));
  }

  async getOverallSchoolRankings(academicYear, schoolId, semester = null) {
    const runForAcademicYear = async (targetAcademicYear) => {
      const semesterRange = this.getSemesterDateRange(targetAcademicYear, semester);

      if (semesterRange) {
        const rows = await this.getSemesterMarks({
          academicYear: targetAcademicYear,
          schoolId,
          component: {
            is: {
              createdAt: {
                gte: semesterRange.start,
                lte: semesterRange.end,
              },
            },
          },
        });

        return this.buildOverallLeaderboardFromMarkRows(rows).map((entry) => ({
          ...entry,
          schoolRank: entry.rank,
          averageScore: entry.average,
        }));
      }

      const rows = await prisma.studentGrade.findMany({
        where: {
          academicYear: targetAcademicYear,
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
          subject: {
            select: {
              subjectId: true,
              subjectName: true,
            },
          },
          class: {
            select: {
              classId: true,
              className: true,
            },
          },
        },
      });

      return this.buildOverallLeaderboardFromGradeRows(rows).map((entry) => ({
        ...entry,
        schoolRank: entry.rank,
        averageScore: entry.average,
      }));
    };

    let rankings = await runForAcademicYear(academicYear);
    if (rankings.length > 0) {
      return rankings;
    }

    const latestYearRow = await prisma.studentGrade.findFirst({
      where: { schoolId },
      select: { academicYear: true },
      orderBy: { academicYear: 'desc' },
    });

    if (!latestYearRow?.academicYear || latestYearRow.academicYear === academicYear) {
      return rankings;
    }

    rankings = await runForAcademicYear(latestYearRow.academicYear);
    return rankings;
  }

  async getOverallStudentRank(studentId, academicYear, schoolId, semester = null) {
    const student = await prisma.student.findFirst({
      where: {
        studentId,
        schoolId,
      },
      select: {
        classId: true,
      },
    });

    if (!student?.classId) {
      return null;
    }

    const rankings = await this.getOverallClassRankings(student.classId, academicYear, schoolId, semester);
    const target = rankings.find((row) => Number(row.studentId) === Number(studentId));

    if (!target) {
      return {
        classId: student.classId,
        rank: null,
        classRank: null,
        totalStudents: rankings.length,
        average: null,
        averageScore: null,
        subjectCount: 0,
      };
    }

    return {
      classId: student.classId,
      rank: target.rank,
      classRank: target.rank,
      totalStudents: rankings.length,
      average: target.average,
      averageScore: target.average,
      subjectCount: target.subjectCount,
    };
  }

  async getOverallStudentSchoolRank(studentId, academicYear, schoolId, semester = null) {
    const rankings = await this.getOverallSchoolRankings(academicYear, schoolId, semester);
    const target = rankings.find((row) => Number(row.studentId) === Number(studentId));

    if (!target) {
      return {
        rank: null,
        schoolRank: null,
        totalStudents: rankings.length,
        average: null,
        averageScore: null,
        subjectCount: 0,
      };
    }

    return {
      rank: target.rank,
      schoolRank: target.rank,
      totalStudents: rankings.length,
      average: target.average,
      averageScore: target.average,
      subjectCount: target.subjectCount,
      classId: target.classId ?? null,
      className: target.className ?? null,
    };
  }

  /**
   * Get all grade components for a class-subject-teacher
   */
  async getGradeComponents(schoolId, classId, subjectId, teacherId, academicYear) {
    const components = await prisma.gradeComponent.findMany({
      where: {
        schoolId,
        classId,
        subjectId,
        teacherId,
        academicYear,
        isActive: true,
      },
      include: {
        _count: {
          select: {
            studentMarks: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const totalWeight = components.reduce((sum, comp) => sum + comp.weight, 0);

    return {
      components,
      totalWeight,
      isComplete: Math.abs(totalWeight - 100) < 0.01,
      remaining: 100 - totalWeight,
    };
  }

  /**
   * Create grade component
   */
  async createGradeComponent(data, schoolId) {
    const component = await prisma.gradeComponent.create({
      data: {
        schoolId,
        classId: data.classId,
        subjectId: data.subjectId,
        teacherId: data.teacherId,
        componentName: data.componentName,
        componentType: data.componentType,
        weight: data.weight,
        description: data.description || null,
        academicYear: data.academicYear,
      },
      include: {
        class: {
          select: {
            className: true,
          },
        },
        subject: {
          select: {
            subjectName: true,
          },
        },
      },
    });

    return component;
  }

  /**
   * Update grade component
   */
  async updateGradeComponent(componentId, data, schoolId) {
    const component = await prisma.gradeComponent.findFirst({
      where: {
        componentId,
        schoolId,
      },
    });

    if (!component) {
      throw new Error('Grade component not found');
    }

    const updated = await prisma.gradeComponent.update({
      where: { componentId },
      data: {
        componentName: data.componentName || component.componentName,
        componentType: data.componentType || component.componentType,
        weight: data.weight !== undefined ? data.weight : component.weight,
        description: data.description !== undefined ? data.description : component.description,
      },
    });

    // Recalculate all student grades for this component's class-subject
    await this.recalculateStudentGrades(
      component.classId,
      component.subjectId,
      component.teacherId,
      component.academicYear,
      schoolId
    );

    return updated;
  }

  /**
   * Delete grade component
   */
  async deleteGradeComponent(componentId, schoolId) {
    const component = await prisma.gradeComponent.findFirst({
      where: {
        componentId,
        schoolId,
      },
      include: {
        _count: {
          select: {
            studentMarks: true,
          },
        },
      },
    });

    if (!component) {
      throw new Error('Grade component not found');
    }

    if (component._count.studentMarks > 0) {
      throw new Error('Cannot delete component with existing marks');
    }

    await prisma.gradeComponent.delete({
      where: { componentId },
    });

    return component;
  }

  /**
   * Enter or update student mark
   */
  async enterStudentMark(data, schoolId) {
    // Get component
    const component = await prisma.gradeComponent.findFirst({
      where: {
        componentId: data.componentId,
        schoolId,
      },
    });

    if (!component) {
      throw new Error('Grade component not found');
    }

    // Verify student belongs to the class
    const student = await prisma.student.findFirst({
      where: {
        studentId: data.studentId,
        classId: component.classId,
        schoolId,
      },
    });

    if (!student) {
      throw new Error('Student not found in this class');
    }

    // Calculate percentage
    const percentage = calculatePercentage(data.marksObtained, component.weight);

    // Upsert mark
    const mark = await prisma.studentMark.upsert({
      where: {
        studentId_componentId: {
          studentId: data.studentId,
          componentId: data.componentId,
        },
      },
      update: {
        marksObtained: data.marksObtained,
        percentage,
        remarks: data.remarks || null,
      },
      create: {
        studentId: data.studentId,
        componentId: data.componentId,
        schoolId,
        classId: component.classId,
        subjectId: component.subjectId,
        marksObtained: data.marksObtained,
        percentage,
        academicYear: component.academicYear,
        remarks: data.remarks || null,
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
        component: true,
      },
    });

    // Recalculate student's total grade
    await this.calculateStudentTotalGrade(
      data.studentId,
      component.classId,
      component.subjectId,
      component.teacherId,
      component.academicYear,
      schoolId
    );

    // Update rankings for the class
    await calculateAndUpdateRankings(
      component.classId,
      component.subjectId,
      component.teacherId,
      component.academicYear,
      schoolId
    );

    return mark;
  }

  /**
   * Calculate total grade for a student
   */
  async calculateStudentTotalGrade(studentId, classId, subjectId, teacherId, academicYear, schoolId) {
    // Get all marks for this student in this subject
    const marks = await prisma.studentMark.findMany({
      where: {
        studentId,
        classId,
        subjectId,
        schoolId,
        academicYear,
      },
      include: {
        component: true,
      },
    });

    // Calculate total score
    const totalScore = calculateTotalScore(marks);
    const percentage = totalScore; // Since weights add to 100, total score IS the percentage
    const status = determineStatus(percentage);

    // Upsert student grade
    const grade = await prisma.studentGrade.upsert({
      where: {
        studentId_classId_subjectId_teacherId_academicYear: {
          studentId,
          classId,
          subjectId,
          teacherId,
          academicYear,
        },
      },
      update: {
        totalScore,
        percentage,
        status,
      },
      create: {
        studentId,
        schoolId,
        classId,
        subjectId,
        teacherId,
        academicYear,
        totalScore,
        percentage,
        status,
      },
    });

    return grade;
  }

  /**
   * Recalculate all student grades for a class-subject
   */
  async recalculateStudentGrades(classId, subjectId, teacherId, academicYear, schoolId) {
    // Get all students in the class
    const students = await prisma.student.findMany({
      where: {
        classId,
        schoolId,
        isActive: true,
      },
    });

    // Recalculate each student's grade
    for (const student of students) {
      await this.calculateStudentTotalGrade(
        student.studentId,
        classId,
        subjectId,
        teacherId,
        academicYear,
        schoolId
      );
    }

    // Update rankings
    await calculateAndUpdateRankings(classId, subjectId, teacherId, academicYear, schoolId);

    return { success: true, studentsRecalculated: students.length };
  }

  /**
   * Get student grade details
   */
  async getStudentGradeDetails(studentId, classId, subjectId, teacherId, academicYear, schoolId) {
    // Get all marks
    const marks = await prisma.studentMark.findMany({
      where: {
        studentId,
        classId,
        subjectId,
        schoolId,
        academicYear,
      },
      include: {
        component: true,
      },
      orderBy: {
        component: {
          createdAt: 'asc',
        },
      },
    });

    // Get total grade
    const grade = await prisma.studentGrade.findFirst({
      where: {
        studentId,
        classId,
        subjectId,
        teacherId,
        academicYear,
        schoolId,
      },
    });

    // Get total students for ranking context
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
      marks,
      grade,
      totalStudents,
    };
  }

  /**
   * Get class grade report
   */
  async getClassGradeReport(classId, subjectId, teacherId, academicYear, schoolId, semester = null) {
    const semesterRange = this.getSemesterDateRange(academicYear, semester);

    if (semesterRange) {
      const components = await prisma.gradeComponent.findMany({
        where: {
          classId,
          subjectId,
          teacherId,
          academicYear,
          schoolId,
          isActive: true,
          createdAt: {
            gte: semesterRange.start,
            lte: semesterRange.end,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      const componentIds = components.map((component) => component.componentId);
      const allMarks = componentIds.length
        ? await prisma.studentMark.findMany({
            where: {
              classId,
              subjectId,
              schoolId,
              academicYear,
              componentId: { in: componentIds },
            },
            include: {
              component: true,
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
          })
        : [];

      const marksByStudent = new Map();
      for (const mark of allMarks) {
        if (!marksByStudent.has(mark.studentId)) {
          marksByStudent.set(mark.studentId, []);
        }
        marksByStudent.get(mark.studentId).push(mark);
      }

      const gradedStudents = Array.from(marksByStudent.entries()).map(([studentId, studentMarks]) => {
        const sample = studentMarks[0];
        const totalScore = studentMarks.reduce((sum, mark) => sum + Number(mark.percentage || 0), 0);
        const percentage = Number(totalScore.toFixed(2));
        const status = determineStatus(percentage);

        return {
          studentId: Number(studentId),
          studentName: sample?.student?.user?.fullName ?? `Student ${studentId}`,
          userId: sample?.student?.user?.userId ?? null,
          marks: studentMarks.map((mark) => ({
            componentName: mark.component.componentName,
            marksObtained: mark.marksObtained,
            weight: mark.component.weight,
            percentage: mark.percentage,
          })),
          totalScore: percentage,
          percentage,
          status,
        };
      });

      gradedStudents.sort((a, b) => {
        if (Number(b.percentage) !== Number(a.percentage)) {
          return Number(b.percentage) - Number(a.percentage);
        }
        return String(a.studentName).localeCompare(String(b.studentName));
      });

      let currentRank = 1;
      let previousScore = null;
      let tiedCount = 0;
      const studentsWithRanks = gradedStudents.map((student) => {
        const roundedScore = Number(student.percentage || 0);
        if (previousScore !== null && roundedScore < previousScore) {
          currentRank += tiedCount;
          tiedCount = 1;
        } else if (previousScore !== null && roundedScore === previousScore) {
          tiedCount += 1;
        } else {
          tiedCount = 1;
        }
        previousScore = roundedScore;

        return {
          ...student,
          rank: currentRank,
        };
      });

      return {
        components,
        students: studentsWithRanks,
        totalStudents: studentsWithRanks.length,
        passCount: studentsWithRanks.filter((student) => student.status === 'PASS').length,
        failCount: studentsWithRanks.filter((student) => student.status === 'FAIL').length,
      };
    }

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

    // Get components
    const components = await prisma.gradeComponent.findMany({
      where: {
        classId,
        subjectId,
        teacherId,
        academicYear,
        schoolId,
      },
    });

    // Get all marks
    const allMarks = await prisma.studentMark.findMany({
      where: {
        classId,
        subjectId,
        schoolId,
        academicYear,
      },
      include: {
        component: true,
      },
    });

    // Map students with their marks
    const studentsWithMarks = grades.map(grade => {
      const studentMarks = allMarks.filter(m => m.studentId === grade.studentId);
      
      return {
        studentId: grade.studentId,
        studentName: grade.student.user.fullName,
        userId: grade.student.user.userId,
        marks: studentMarks.map(m => ({
          componentName: m.component.componentName,
          marksObtained: m.marksObtained,
          weight: m.component.weight,
          percentage: m.percentage,
        })),
        totalScore: grade.totalScore,
        percentage: grade.percentage,
        status: grade.status,
        rank: grade.rank,
      };
    });

    return {
      components,
      students: studentsWithMarks,
      totalStudents: grades.length,
      passCount: grades.filter(g => g.status === 'PASS').length,
      failCount: grades.filter(g => g.status === 'FAIL').length,
    };
  }

  /**
   * Get aggregated subject results for a student (across classes/teachers for the same academicYear).
   * Returns one entry per subjectId, using the best (highest percentage) row for that subject.
   */
  async getStudentSummary(studentId, academicYear, schoolId, semester = null) {
    const semesterRange = this.getSemesterDateRange(academicYear, semester);
    let subjects = [];

    if (semesterRange) {
      const marks = await this.getSemesterMarks({
        studentId,
        academicYear,
        schoolId,
        component: {
          is: {
            createdAt: {
              gte: semesterRange.start,
              lte: semesterRange.end,
            },
          },
        },
      });

      const subjectTeacherMap = new Map();
      for (const mark of marks) {
        const teacherId = mark.component?.teacherId ?? 0;
        const key = `${mark.subjectId}:${teacherId}`;
        const existing = subjectTeacherMap.get(key) || {
          subjectId: mark.subjectId,
          subjectName: mark.subject?.subjectName ?? `Subject #${mark.subjectId}`,
          average: 0,
          teacherName: null,
        };

        existing.average += Number(mark.percentage || 0);
        subjectTeacherMap.set(key, existing);
      }

      const bestBySubject = new Map();
      for (const entry of subjectTeacherMap.values()) {
        const existing = bestBySubject.get(String(entry.subjectId));
        if (!existing || Number(entry.average) > Number(existing.average)) {
          bestBySubject.set(String(entry.subjectId), entry);
        }
      }

      subjects = Array.from(bestBySubject.values())
        .map((r) => ({
          subjectId: r.subjectId,
          subjectName: r.subjectName,
          average: Number(Number(r.average || 0).toFixed(2)),
          averageScore: Number(Number(r.average || 0).toFixed(2)),
          rank: null,
          subjectRank: null,
          status: Number(r.average || 0) >= 60 ? 'PASS' : 'FAIL',
          teacherName: r.teacherName ?? null,
        }))
        .sort((a, b) => String(a.subjectName).localeCompare(String(b.subjectName)));
    } else {
      const rows = await prisma.studentGrade.findMany({
        where: {
          studentId,
          academicYear,
          schoolId,
        },
        include: {
          subject: {
            select: {
              subjectId: true,
              subjectName: true,
            },
          },
          teacher: {
            include: {
              user: {
                select: {
                  fullName: true,
                },
              },
            },
          },
        },
      });

      const bestBySubject = this.buildBestSubjectMap(rows);

      subjects = Array.from(bestBySubject.values())
        .map((r) => ({
          subjectId: r.subjectId,
          subjectName: r.subject?.subjectName ?? `Subject #${r.subjectId}`,
          average: Number(r.percentage || 0),
          averageScore: Number(r.percentage || 0),
          rank: r.rank ?? null,
          subjectRank: r.rank ?? null,
          status: r.status ?? null,
          teacherName: r.teacher?.user?.fullName ?? null,
        }))
        .sort((a, b) => String(a.subjectName).localeCompare(String(b.subjectName)));
    }

    const average = subjects.length
      ? subjects.reduce((sum, s) => sum + Number(s.average || 0), 0) / subjects.length
      : 0;
    const overallRank = await this.getOverallStudentRank(studentId, academicYear, schoolId, semester);
    const schoolRank = await this.getOverallStudentSchoolRank(studentId, academicYear, schoolId, semester);

    return {
      academicYear,
      semester: this.normalizeSemester(semester),
      subjects,
      summary: {
        subjectCount: subjects.length,
        average,
        averageScore: average,
      },
      averageScore: average,
      classRank: overallRank?.classRank ?? overallRank?.rank ?? null,
      schoolRankValue: schoolRank?.schoolRank ?? schoolRank?.rank ?? null,
      overallRank,
      schoolRank,
    };
  }


 /**
 * Delete grade component (hard delete)
 */
 async deleteGradeComponent(componentId, schoolId) {
  const component = await prisma.gradeComponent.findFirst({
    where: {
      componentId,
      schoolId,
    },
    include: {
      _count: {
        select: {
          studentMarks: true,
        },
      },
    },
  });

  if (!component) {
    throw new Error('Grade component not found');
  }

  if (component._count.studentMarks > 0) {
    throw new Error('Cannot delete component with existing marks. Delete marks first or use soft delete.');
  }

  await prisma.gradeComponent.delete({
    where: { componentId },
  });

  return component;
 }

 /**
 * Soft delete grade component (mark as inactive)
 */
 async softDeleteGradeComponent(componentId, schoolId) {
  const component = await prisma.gradeComponent.findFirst({
    where: {
      componentId,
      schoolId,
    },
  });

  if (!component) {
    throw new Error('Grade component not found');
  }

  const updated = await prisma.gradeComponent.update({
    where: { componentId },
    data: {
      isActive: false,
    },
  });

  return updated;
 }

 /**
 * Delete all marks for a component (partition delete)
 */
 async deleteComponentMarks(componentId, schoolId) {
  const component = await prisma.gradeComponent.findFirst({
    where: {
      componentId,
      schoolId,
    },
  });

  if (!component) {
    throw new Error('Grade component not found');
  }

  // Delete all marks for this component
  const deletedMarks = await prisma.studentMark.deleteMany({
    where: {
      componentId,
      schoolId,
    },
  });

  // Recalculate all student grades for this class-subject
  await this.recalculateStudentGrades(
    component.classId,
    component.subjectId,
    component.teacherId,
    component.academicYear,
    schoolId
  );

  return {
    component,
    deletedMarksCount: deletedMarks.count,
  };
 }

 /**
 * Delete component with all its marks (cascade delete)
 */
 async deleteComponentWithMarks(componentId, schoolId) {
  const component = await prisma.gradeComponent.findFirst({
    where: {
      componentId,
      schoolId,
    },
    include: {
      _count: {
        select: {
          studentMarks: true,
        },
      },
    },
  });

  if (!component) {
    throw new Error('Grade component not found');
  }

  const marksCount = component._count.studentMarks;

  // Delete in transaction
  await prisma.$transaction(async (tx) => {
    // Delete all marks
    await tx.studentMark.deleteMany({
      where: {
        componentId,
        schoolId,
      },
    });

    // Delete component
    await tx.gradeComponent.delete({
      where: { componentId },
    });
  });

  // Recalculate all student grades
  await this.recalculateStudentGrades(
    component.classId,
    component.subjectId,
    component.teacherId,
    component.academicYear,
    schoolId
  );

  return {
    component,
    deletedMarksCount: marksCount,
  };
 }
}

module.exports = new GradeService();
