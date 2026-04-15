const prisma = require('../config/database');
const gradeService = require('./grade.service');

function normalizeTermLabel(termId) {
  const raw = String(termId || '').trim().toUpperCase();
  if (!raw) return { key: null, label: 'Full Year' };

  if (['S1', 'SEM1', 'SEMESTER1', '1'].includes(raw)) {
    return { key: 'S1', label: 'Semester 1' };
  }
  if (['S2', 'SEM2', 'SEMESTER2', '2'].includes(raw)) {
    return { key: 'S2', label: 'Semester 2' };
  }
  return { key: raw, label: raw };
}

async function buildReportCardData({ studentId, termId, schoolId, requestedAcademicYear }) {
  const parsedStudentId = parseInt(studentId, 10);
  if (!Number.isInteger(parsedStudentId)) {
    return { error: { status: 400, message: 'Invalid studentId.' } };
  }

  const student = await prisma.student.findFirst({
    where: {
      studentId: parsedStudentId,
      schoolId,
    },
    include: {
      user: { select: { userId: true, fullName: true } },
      class: { select: { className: true, academicYear: true } },
      school: { select: { schoolName: true, logo: true } },
    },
  });

  if (!student) {
    return { error: { status: 404, message: 'Student not found.' } };
  }

  const academicYear = String(requestedAcademicYear || student.class?.academicYear || '').trim();
  if (!academicYear) {
    return { error: { status: 400, message: 'Academic year is required.' } };
  }

  const term = normalizeTermLabel(termId);
  const summaryData = await gradeService.getStudentSummary(
    parsedStudentId,
    academicYear,
    schoolId,
    term.key
  );

  const subjects = (summaryData?.subjects || []).map((item) => ({
    subjectName: item.subjectName,
    score: Number(item.averageScore ?? item.average ?? 0),
    letterGrade: item.status === 'PASS' ? 'P' : 'F',
    remarks: item.status === 'PASS' ? 'Good progress' : 'Needs improvement',
  }));

  if (subjects.length === 0) {
    return { error: { status: 404, message: 'No grade data found for this student and term.' } };
  }

  const totalScore = subjects.reduce((sum, s) => sum + Number(s.score || 0), 0);
  const averageScore = totalScore / subjects.length;
  const teacherRemark =
    averageScore >= 75
      ? 'Excellent effort and performance. Keep it up.'
      : averageScore >= 60
        ? 'Good progress. Focus on consistency for stronger results.'
        : 'Support is recommended in key subjects to improve outcomes.';

  return {
    data: {
      school: {
        schoolName: student.school?.schoolName,
        logo: student.school?.logo || null,
      },
      student: {
        studentId: student.studentId,
        userId: student.user?.userId,
        fullName: student.user?.fullName,
        className: student.class?.className,
        academicYear,
      },
      term: {
        key: term.key,
        label: term.label,
      },
      subjects,
      summary: {
        totalScore,
        averageScore,
        rank: summaryData?.classRank ?? null,
      },
      teacherRemark,
      generatedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  buildReportCardData,
};
