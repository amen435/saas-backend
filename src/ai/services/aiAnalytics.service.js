// src/ai/services/aiAnalytics.service.js

const prisma = require('../../config/database');
const geminiService = require('./gemini.service');
const { 
  performanceAnalysisPrompt, 
  attendanceTrendPrompt,
  classComparisonPrompt 
} = require('../utils/promptTemplates');

class AiAnalyticsService {
  getMonthWindows(monthCount = 6) {
    const windows = [];
    const now = new Date();

    for (let i = monthCount - 1; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      windows.push({
        start,
        end,
        label: start.toLocaleDateString('en-US', { month: 'short' }),
        key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      });
    }

    return windows;
  }

  buildDistribution(values, buckets) {
    return buckets.map((bucket) => ({
      name: bucket.name,
      count: values.filter((value) => bucket.test(Number(value) || 0)).length,
    }));
  }

  /**
   * Analyze student performance
   */
  async analyzeStudentPerformance(studentId, schoolId, academicYear) {
    // Check cache first
    const cached = await this.getFromCache(schoolId, 'performance', { studentId, academicYear });
    if (cached && !this.isCacheExpired(cached.expiresAt)) {
      return cached.insights;
    }

    // Get student grades and marks
    const grades = await prisma.studentGrade.findMany({
      where: {
        studentId,
        schoolId,
        academicYear,
      },
      include: {
        subject: {
          select: {
            subjectName: true,
          },
        },
      },
    });

    const marks = await prisma.studentMark.findMany({
      where: {
        studentId,
        schoolId,
        academicYear,
      },
      include: {
        component: {
          include: {
            subject: true,
          },
        },
      },
    });

    // Prepare data for AI
    const studentData = {
      totalSubjects: grades.length,
      grades: grades.map(g => ({
        subject: g.subject.subjectName,
        totalScore: g.totalScore,
        percentage: g.percentage,
        status: g.status,
        rank: g.rank,
      })),
      overallAverage: grades.reduce((sum, g) => sum + g.percentage, 0) / grades.length,
      passRate: (grades.filter(g => g.status === 'PASS').length / grades.length) * 100,
    };

    // Generate AI insights
    const prompt = performanceAnalysisPrompt(studentData);
    const result = await geminiService.generateJSON(prompt);

    // Cache results
    await this.saveToCache(schoolId, 'performance', { studentId, academicYear }, result.data);

    return result.data;
  }

  /**
   * Analyze attendance trends
   */
  async analyzeAttendanceTrends(studentId, schoolId, startDate, endDate) {
    // Check cache
    const cacheKey = { studentId, startDate, endDate };
    const cached = await this.getFromCache(schoolId, 'attendance', cacheKey);
    if (cached && !this.isCacheExpired(cached.expiresAt)) {
      return cached.insights;
    }

    // Get attendance records
    const attendance = await prisma.attendance.findMany({
      where: {
        studentId,
        schoolId,
        attendanceDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: {
        attendanceDate: 'asc',
      },
    });

    // Calculate statistics
    const total = attendance.length;
    const present = attendance.filter(a => a.status === 'PRESENT').length;
    const absent = attendance.filter(a => a.status === 'ABSENT').length;
    const late = attendance.filter(a => a.status === 'LATE').length;

    const attendanceData = {
      totalDays: total,
      present,
      absent,
      late,
      attendanceRate: ((present + late) / total) * 100,
      records: attendance.map(a => ({
        date: a.attendanceDate,
        status: a.status,
      })),
    };

    // Generate AI insights
    const prompt = attendanceTrendPrompt(attendanceData);
    const result = await geminiService.generateJSON(prompt);

    // Cache results
    await this.saveToCache(schoolId, 'attendance', cacheKey, result.data);

    return result.data;
  }

  /**
   * Identify at-risk students
   */
  async identifyAtRiskStudents(classId, schoolId, academicYear) {
    // Get all students in class with their performance
    const students = await prisma.student.findMany({
      where: {
        classId,
        schoolId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            fullName: true,
          },
        },
        grades: {
          where: {
            academicYear,
          },
        },
        attendance: {
          where: {
            attendanceDate: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 3)),
            },
          },
        },
      },
    });

    const atRiskStudents = [];

    for (const student of students) {
      const failingSubjects = student.grades.filter(g => g.status === 'FAIL').length;
      const averageScore = student.grades.length > 0
        ? student.grades.reduce((sum, g) => sum + g.percentage, 0) / student.grades.length
        : 0;

      const attendanceRate = student.attendance.length > 0
        ? (student.attendance.filter(a => a.status === 'PRESENT').length / student.attendance.length) * 100
        : 100;

      if (failingSubjects >= 2 || averageScore < 50 || attendanceRate < 75) {
        atRiskStudents.push({
          studentId: student.studentId,
          name: student.user.fullName,
          averageScore: averageScore.toFixed(2),
          failingSubjects,
          attendanceRate: attendanceRate.toFixed(2),
          riskFactors: [
            failingSubjects >= 2 ? `Failing ${failingSubjects} subjects` : null,
            averageScore < 50 ? 'Low average score' : null,
            attendanceRate < 75 ? 'Poor attendance' : null,
          ].filter(Boolean),
        });
      }
    }

    return {
      totalStudents: students.length,
      atRiskCount: atRiskStudents.length,
      atRiskPercentage: ((atRiskStudents.length / students.length) * 100).toFixed(2),
      students: atRiskStudents,
    };
  }

  /**
   * Compare class performance
   */
  async compareClassPerformance(classId, schoolId, academicYear) {
    const students = await prisma.student.findMany({
      where: {
        classId,
        schoolId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            userId: true,
            fullName: true,
          },
        },
        grades: {
          where: {
            academicYear,
          },
          include: {
            subject: true,
          },
        },
      },
    });

    const classData = students.map(s => ({
      studentId: s.studentId,
      name: s.user.fullName,
      average: s.grades.length > 0
        ? s.grades.reduce((sum, g) => sum + g.percentage, 0) / s.grades.length
        : 0,
      grades: s.grades.map(g => ({
        subject: g.subject.subjectName,
        score: g.percentage,
      })),
    }));

    const prompt = classComparisonPrompt(classData);
    const result = await geminiService.generateJSON(prompt);

    return result.data;
  }

  /**
   * Get performance trends over time
   */
  async getPerformanceTrends(studentId, schoolId) {
    const grades = await prisma.studentGrade.findMany({
      where: {
        studentId,
        schoolId,
      },
      include: {
        subject: {
          select: {
            subjectName: true,
          },
        },
      },
      orderBy: {
        academicYear: 'asc',
      },
    });

    // Group by academic year
    const byYear = {};
    grades.forEach(g => {
      if (!byYear[g.academicYear]) {
        byYear[g.academicYear] = [];
      }
      byYear[g.academicYear].push(g);
    });

    const trends = Object.keys(byYear).map(year => ({
      academicYear: year,
      average: byYear[year].reduce((sum, g) => sum + g.percentage, 0) / byYear[year].length,
      passed: byYear[year].filter(g => g.status === 'PASS').length,
      failed: byYear[year].filter(g => g.status === 'FAIL').length,
    }));

    return {
      trends,
      improvement: this.calculateImprovement(trends),
    };
  }

  async getPlatformOverview() {
    const monthWindows = this.getMonthWindows(6);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30Days = new Date(now);
    last30Days.setDate(last30Days.getDate() - 30);

    const [
      totalSchools,
      activeSchools,
      totalStudents,
      totalTeachers,
      totalClasses,
      newSchoolsThisMonth,
      grades,
      recentAttendance,
      schools,
      allStudents,
      allTeachers,
      allAnnouncements,
      allHomework,
      allTimetables,
    ] = await Promise.all([
      prisma.school.count(),
      prisma.school.count({ where: { isActive: true } }),
      prisma.student.count({ where: { isActive: true } }),
      prisma.teacher.count({ where: { isActive: true } }),
      prisma.class.count(),
      prisma.school.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.studentGrade.findMany({
        select: { schoolId: true, percentage: true },
      }),
      prisma.attendance.findMany({
        where: {
          attendanceDate: { gte: last30Days },
        },
        select: { schoolId: true, status: true, attendanceDate: true },
      }),
      prisma.school.findMany({
        include: {
          _count: {
            select: {
              students: true,
              teachers: true,
              classes: true,
              announcements: true,
            },
          },
        },
      }),
      prisma.student.findMany({
        select: { createdAt: true },
      }),
      prisma.teacher.findMany({
        select: { createdAt: true },
      }),
      prisma.announcement.findMany({
        select: { schoolId: true, createdAt: true },
      }),
      prisma.aiHomework.findMany({
        select: { schoolId: true, createdAt: true },
      }),
      prisma.timetable.findMany({
        select: { schoolId: true, createdAt: true },
      }),
    ]);

    const averagePerformance = grades.length
      ? grades.reduce((sum, grade) => sum + (Number(grade.percentage) || 0), 0) / grades.length
      : 0;
    const attendanceRate = recentAttendance.length
      ? (recentAttendance.filter((row) => row.status === 'PRESENT').length / recentAttendance.length) * 100
      : 0;

    const gradeAvgBySchool = grades.reduce((acc, grade) => {
      const schoolId = grade.schoolId;
      if (!acc[schoolId]) {
        acc[schoolId] = { total: 0, count: 0 };
      }
      acc[schoolId].total += Number(grade.percentage) || 0;
      acc[schoolId].count += 1;
      return acc;
    }, {});

    const attendanceBySchool = recentAttendance.reduce((acc, row) => {
      const schoolId = row.schoolId;
      if (!acc[schoolId]) {
        acc[schoolId] = { present: 0, total: 0 };
      }
      acc[schoolId].total += 1;
      if (row.status === 'PRESENT') {
        acc[schoolId].present += 1;
      }
      return acc;
    }, {});

    const monthlyGrowth = monthWindows.map((window) => ({
      month: window.label,
      schools: schools.filter((row) => row.createdAt <= window.end).length,
      students: allStudents.filter((row) => row.createdAt <= window.end).length,
      teachers: allTeachers.filter((row) => row.createdAt <= window.end).length,
    }));

    const monthlyPerformance = monthWindows.map((window) => {
      const attendanceRows = recentAttendance.filter(
        (row) => row.attendanceDate >= window.start && row.attendanceDate <= window.end
      );
      const monthlyAttendanceRate = attendanceRows.length
        ? (attendanceRows.filter((row) => row.status === 'PRESENT').length / attendanceRows.length) * 100
        : 0;

      return {
        month: window.label,
        attendanceRate: Number(monthlyAttendanceRate.toFixed(2)),
        averageGrade: Number(averagePerformance.toFixed(2)),
      };
    });

    const cityCounts = schools.reduce((acc, school) => {
      const city = school.city || 'Other';
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {});

    const schoolsByCity = Object.entries(cityCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const activeSchoolIds = schools.filter((school) => school.isActive).map((school) => school.schoolId);
    const featureUsage = [
      {
        feature: 'Attendance',
        usage: activeSchoolIds.length
          ? Math.round((new Set(recentAttendance.map((row) => row.schoolId)).size / activeSchoolIds.length) * 100)
          : 0,
      },
      {
        feature: 'Grades',
        usage: activeSchoolIds.length
          ? Math.round((new Set(grades.map((row) => row.schoolId)).size / activeSchoolIds.length) * 100)
          : 0,
      },
      {
        feature: 'Timetable',
        usage: activeSchoolIds.length
          ? Math.round((new Set(allTimetables.map((row) => row.schoolId)).size / activeSchoolIds.length) * 100)
          : 0,
      },
      {
        feature: 'Homework',
        usage: activeSchoolIds.length
          ? Math.round((new Set(allHomework.map((row) => row.schoolId)).size / activeSchoolIds.length) * 100)
          : 0,
      },
      {
        feature: 'Announcements',
        usage: activeSchoolIds.length
          ? Math.round((new Set(allAnnouncements.map((row) => row.schoolId)).size / activeSchoolIds.length) * 100)
          : 0,
      },
    ];

    const topSchools = schools
      .map((school) => {
        const gradeStats = gradeAvgBySchool[school.schoolId] || { total: 0, count: 0 };
        const attendanceStats = attendanceBySchool[school.schoolId] || { present: 0, total: 0 };
        const averageGrade = gradeStats.count ? gradeStats.total / gradeStats.count : 0;
        const schoolAttendanceRate = attendanceStats.total
          ? (attendanceStats.present / attendanceStats.total) * 100
          : 0;

        return {
          schoolId: school.schoolId,
          name: school.schoolName,
          city: school.city || 'Other',
          isActive: school.isActive,
          students: school._count.students,
          teachers: school._count.teachers,
          classes: school._count.classes,
          announcements: school._count.announcements,
          averageGrade: Number(averageGrade.toFixed(2)),
          attendanceRate: Number(schoolAttendanceRate.toFixed(2)),
        };
      })
      .sort((a, b) => {
        if (b.students !== a.students) return b.students - a.students;
        return b.averageGrade - a.averageGrade;
      })
      .slice(0, 5);

    const gradeDistribution = this.buildDistribution(
      grades.map((grade) => grade.percentage),
      [
        { name: 'A', test: (value) => value >= 90 },
        { name: 'B', test: (value) => value >= 80 && value < 90 },
        { name: 'C', test: (value) => value >= 70 && value < 80 },
        { name: 'D', test: (value) => value >= 50 && value < 70 },
        { name: 'F', test: (value) => value < 50 },
      ]
    );

    return {
      overview: {
        totalSchools,
        activeSchools,
        inactiveSchools: totalSchools - activeSchools,
        totalStudents,
        totalTeachers,
        totalClasses,
        averagePerformance: Number(averagePerformance.toFixed(2)),
        attendanceRate: Number(attendanceRate.toFixed(2)),
        newSchoolsThisMonth,
      },
      monthlyGrowth,
      monthlyPerformance,
      schoolsByCity,
      topSchools,
      featureUsage,
      gradeDistribution,
    };
  }

  /**
   * Cache helpers
   */
  async saveToCache(schoolId, analysisType, data, insights) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Cache for 24 hours

    await prisma.aiAnalyticsCache.create({
      data: {
        schoolId,
        analysisType,
        classId: data.classId || null,
        studentId: data.studentId || null,
        academicYear: data.academicYear || new Date().getFullYear().toString(),
        insights,
        data,
        expiresAt,
      },
    });
  }

  async getFromCache(schoolId, analysisType, data) {
    return await prisma.aiAnalyticsCache.findFirst({
      where: {
        schoolId,
        analysisType,
        studentId: data.studentId || null,
        classId: data.classId || null,
        academicYear: data.academicYear || null,
      },
      orderBy: {
        generatedAt: 'desc',
      },
    });
  }

  isCacheExpired(expiresAt) {
    return new Date() > new Date(expiresAt);
  }

  calculateImprovement(trends) {
    if (trends.length < 2) return 0;
    const first = trends[0].average;
    const last = trends[trends.length - 1].average;
    return ((last - first) / first) * 100;
  }
}

module.exports = new AiAnalyticsService();
