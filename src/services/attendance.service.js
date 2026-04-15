// src/services/attendance.service.js

const prisma = require('../config/database');
const { formatDate } = require('../utils/attendanceValidation');

class AttendanceService {
  resolveDateOnly(dateInput) {
    const target = dateInput ? new Date(dateInput) : new Date();
    if (Number.isNaN(target.getTime())) {
      throw new Error('Invalid date');
    }
    return new Date(target.getFullYear(), target.getMonth(), target.getDate());
  }

  async getSchoolAttendanceSummary({ schoolId, date, classId, role } = {}) {
    const attendanceDate = this.resolveDateOnly(date);
    const normalizedRole = String(role || 'ALL').trim().toUpperCase();
    const classFilter = classId ? Number.parseInt(classId, 10) : null;

    const studentWhere = {
      schoolId,
      attendanceDate,
      ...(classFilter ? { classId: classFilter } : {}),
    };

    const teacherWhere = {
      schoolId,
      attendanceDate,
      ...(classFilter ? { classId: classFilter } : {}),
    };

    const [studentRecords, teacherRecords, alerts] = await Promise.all([
      normalizedRole === 'TEACHER' ? [] : prisma.attendance.findMany({ where: studentWhere }),
      normalizedRole === 'STUDENT' ? [] : prisma.teacherAttendance.findMany({ where: teacherWhere }),
      prisma.alert.count({
        where: {
          schoolId,
          ...(classFilter ? { classId: classFilter } : {}),
          timestamp: {
            gte: attendanceDate,
            lt: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const combined = [...studentRecords, ...teacherRecords];
    return {
      total: combined.length,
      present: combined.filter((item) => item.status === 'PRESENT').length,
      absent: combined.filter((item) => item.status === 'ABSENT').length,
      late: combined.filter((item) => item.status === 'LATE').length,
      alerts,
      date: attendanceDate.toISOString(),
    };
  }

  async getSchoolAttendanceRecords({ schoolId, date, classId, role } = {}) {
    const attendanceDate = this.resolveDateOnly(date);
    const normalizedRole = String(role || 'ALL').trim().toUpperCase();
    const classFilter = classId ? Number.parseInt(classId, 10) : null;

    const [studentRecords, teacherRecords] = await Promise.all([
      normalizedRole === 'TEACHER'
        ? []
        : prisma.attendance.findMany({
            where: {
              schoolId,
              attendanceDate,
              ...(classFilter ? { classId: classFilter } : {}),
            },
            include: {
              student: {
                include: {
                  user: { select: { userId: true, fullName: true } },
                  class: { select: { className: true } },
                },
              },
              timetable: {
                include: {
                  subject: { select: { subjectName: true } },
                },
              },
            },
            orderBy: { recordedAt: 'desc' },
          }),
      normalizedRole === 'STUDENT'
        ? []
        : prisma.teacherAttendance.findMany({
            where: {
              schoolId,
              attendanceDate,
              ...(classFilter ? { classId: classFilter } : {}),
            },
            include: {
              teacher: {
                include: {
                  user: { select: { userId: true, fullName: true } },
                },
              },
              class: { select: { className: true } },
              timetable: {
                include: {
                  subject: { select: { subjectName: true } },
                },
              },
            },
            orderBy: { recordedAt: 'desc' },
          }),
    ]);

    const normalizedStudents = studentRecords.map((record) => ({
      id: `student-${record.attendanceId}`,
      name: record.student?.user?.fullName,
      role: 'STUDENT',
      class: record.student?.class?.className,
      subject: record.timetable?.subject?.subjectName || null,
      status: record.status,
      time: record.recordedAt,
      method: record.method || 'WEBCAM',
      photoUrl: record.student?.photoUrl || null,
      similarityScore: record.similarityScore,
      timetableId: record.timetableId,
    }));

    const normalizedTeachers = teacherRecords.map((record) => ({
      id: `teacher-${record.teacherAttendanceId}`,
      name: record.teacher?.user?.fullName,
      role: 'TEACHER',
      class: record.class?.className || null,
      subject: record.timetable?.subject?.subjectName || null,
      status: record.status,
      time: record.recordedAt,
      method: record.method || 'WEBCAM',
      photoUrl: record.teacher?.photoUrl || null,
      similarityScore: record.similarityScore,
      timetableId: record.timetableId,
    }));

    return [...normalizedStudents, ...normalizedTeachers].sort(
      (left, right) => new Date(right.time).getTime() - new Date(left.time).getTime()
    );
  }

  async getAlerts({ schoolId, date, classId, studentId } = {}) {
    const classFilter = classId ? Number.parseInt(classId, 10) : null;
    const studentFilter = studentId ? Number.parseInt(studentId, 10) : null;
    const alertDate = date ? this.resolveDateOnly(date) : null;

    const alerts = await prisma.alert.findMany({
      where: {
        schoolId,
        ...(classFilter ? { classId: classFilter } : {}),
        ...(alertDate
          ? {
              timestamp: {
                gte: alertDate,
                lt: new Date(alertDate.getTime() + 24 * 60 * 60 * 1000),
              },
            }
          : {}),
        ...(studentFilter
          ? {
              user: {
                student: {
                  studentId: studentFilter,
                },
              },
            }
          : {}),
      },
      include: {
        user: {
          select: {
            fullName: true,
            role: true,
          },
        },
        class: {
          select: {
            classId: true,
            className: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    return alerts.map((alert) => ({
      ...alert,
      id: alert.alertId,
      name: alert.user?.fullName || 'Unknown person',
      detectedClassroom: alert.class?.className || 'Unknown class',
      expectedClass: alert.type === 'WRONG_CLASS' ? 'Assigned class mismatch' : null,
    }));
  }

  async getParentAttendanceTimeline({ schoolId, userId, studentId, date }) {
    const attendanceDate = this.resolveDateOnly(date);
    const parent = await prisma.parent.findFirst({
      where: { userId, schoolId, isActive: true },
      select: { parentId: true },
    });

    if (!parent) {
      throw new Error('Parent record not found');
    }

    const link = await prisma.parentStudent.findFirst({
      where: {
        parentId: parent.parentId,
        studentId: Number.parseInt(studentId, 10),
      },
    });

    if (!link) {
      throw new Error('Student is not linked to this parent');
    }

    const student = await prisma.student.findFirst({
      where: {
        studentId: Number.parseInt(studentId, 10),
        schoolId,
      },
      include: {
        user: { select: { fullName: true } },
        class: {
          select: {
            classId: true,
            className: true,
            academicYear: true,
          },
        },
      },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const weekday = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][attendanceDate.getDay()];

    const [timetable, attendanceRecords, alerts, aggregateStats] = await Promise.all([
      prisma.timetable.findMany({
        where: {
          schoolId,
          classId: student.classId,
          academicYear: student.class.academicYear,
          dayOfWeek: weekday,
          isActive: true,
        },
        include: {
          subject: { select: { subjectName: true } },
          teacher: {
            include: {
              user: { select: { fullName: true } },
            },
          },
        },
        orderBy: { periodNumber: 'asc' },
      }),
      prisma.attendance.findMany({
        where: {
          schoolId,
          studentId: student.studentId,
          attendanceDate,
        },
      }),
      this.getAlerts({ schoolId, date: attendanceDate, studentId: student.studentId }),
      this.getStudentAttendance(student.studentId, schoolId, {}),
    ]);

    const attendanceByTimetable = new Map(
      attendanceRecords
        .filter((record) => record.timetableId)
        .map((record) => [record.timetableId, record])
    );

    const timeline = timetable.map((entry) => {
      const attendance = attendanceByTimetable.get(entry.timetableId);
      return {
        periodNumber: entry.periodNumber,
        startTime: entry.startTime,
        endTime: entry.endTime,
        subject: { name: entry.subject?.subjectName || 'Subject' },
        teacher: { fullName: entry.teacher?.user?.fullName || 'Teacher' },
        attendance: attendance
          ? {
              status: attendance.status,
              method:
                attendance.method === 'ESP32_CAM'
                  ? 'Facial Recognition'
                  : attendance.method === 'WEBCAM'
                    ? 'System'
                    : attendance.method,
            }
          : null,
      };
    });

    const statistics = aggregateStats.statistics || { total: 0, present: 0, absent: 0, late: 0 };
    const overallAttendance = statistics.total
      ? Number(((Number(statistics.present || 0) / Number(statistics.total || 1)) * 100).toFixed(0))
      : 0;

    return {
      student: {
        fullName: student.user?.fullName,
        class: {
          className: student.class?.className,
        },
      },
      statistics: {
        ...statistics,
        presentToday: attendanceRecords.filter((record) => record.status === 'PRESENT').length,
        totalToday: timetable.length,
        overallAttendance,
      },
      timeline,
      alerts: alerts.map((alert) => ({
        ...alert,
        type:
          alert.type === 'WRONG_CLASS'
            ? 'ANOMALY'
            : alert.type === 'UNKNOWN_PERSON'
              ? 'MISSING'
              : 'ANOMALY',
      })),
    };
  }
  /**
   * Record attendance for a single student
   */
  async recordAttendance(data, schoolId, teacherId) {
    const { studentId, classId, attendanceDate, status, remarks } = data;

    // Verify student belongs to the class
    const student = await prisma.student.findFirst({
      where: {
        studentId,
        classId,
        schoolId,
      },
    });

    if (!student) {
      throw new Error('Student not found in this class');
    }

    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: {
        classId,
        schoolId,
      },
    });

    if (!classData) {
      throw new Error('Class not found');
    }

    // Upsert attendance (update if exists, create if not)
    const attendance = await prisma.attendance.upsert({
      where: {
        studentId_classId_attendanceDate: {
          studentId,
          classId,
          attendanceDate: new Date(attendanceDate),
        },
      },
      update: {
        status,
        remarks: remarks || null,
        teacherId,
      },
      create: {
        studentId,
        classId,
        schoolId,
        teacherId,
        attendanceDate: new Date(attendanceDate),
        status,
        remarks: remarks || null,
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                fullName: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    return attendance;
  }

  /**
   * Record bulk attendance for multiple students
   */
  async recordBulkAttendance(classId, attendanceDate, records, schoolId, teacherId) {
    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: {
        classId,
        schoolId,
      },
    });

    if (!classData) {
      throw new Error('Class not found');
    }

    // Get all students in the class
    const students = await prisma.student.findMany({
      where: {
        classId,
        schoolId,
        isActive: true,
      },
    });

    const studentIds = students.map(s => s.studentId);

    // Validate all student IDs belong to this class
    const invalidStudents = records.filter(r => !studentIds.includes(r.studentId));
    if (invalidStudents.length > 0) {
      throw new Error(`Invalid student IDs: ${invalidStudents.map(s => s.studentId).join(', ')}`);
    }

    // Create/update attendance records
    const results = await prisma.$transaction(
      records.map(record =>
        prisma.attendance.upsert({
          where: {
            studentId_classId_attendanceDate: {
              studentId: record.studentId,
              classId,
              attendanceDate: new Date(attendanceDate),
            },
          },
          update: {
            status: record.status,
            remarks: record.remarks || null,
            teacherId,
          },
          create: {
            studentId: record.studentId,
            classId,
            schoolId,
            teacherId,
            attendanceDate: new Date(attendanceDate),
            status: record.status,
            remarks: record.remarks || null,
          },
        })
      )
    );

    return results;
  }

  /**
   * Get attendance for a class on a specific date
   */
  async getClassAttendance(classId, attendanceDate, schoolId) {
    // Get all students in the class
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
      },
      orderBy: {
        user: {
          fullName: 'asc',
        },
      },
    });

    // Get attendance records for this date
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        classId,
        schoolId,
        attendanceDate: new Date(attendanceDate),
      },
    });

    // Map students with their attendance
    const studentsWithAttendance = students.map(student => {
      const attendance = attendanceRecords.find(a => a.studentId === student.studentId);
      
      return {
        studentId: student.studentId,
        userId: student.user.userId,
        studentName: student.user.fullName,
        status: attendance ? attendance.status : null,
        remarks: attendance ? attendance.remarks : null,
        hasAttendance: !!attendance,
        attendanceId: attendance ? attendance.attendanceId : null,
      };
    });

    // Calculate summary
    const summary = {
      total: students.length,
      present: attendanceRecords.filter(a => a.status === 'PRESENT').length,
      absent: attendanceRecords.filter(a => a.status === 'ABSENT').length,
      late: attendanceRecords.filter(a => a.status === 'LATE').length,
      notRecorded: students.length - attendanceRecords.length,
    };

    return {
      students: studentsWithAttendance,
      summary,
      date: formatDate(attendanceDate),
    };
  }

  /**
   * Get student attendance history
   */
  async getStudentAttendance(studentId, schoolId, filters = {}) {
    const where = {
      studentId,
      schoolId,
    };

    if (filters.startDate && filters.endDate) {
      where.attendanceDate = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      };
    } else if (filters.startDate) {
      where.attendanceDate = {
        gte: new Date(filters.startDate),
      };
    } else if (filters.endDate) {
      where.attendanceDate = {
        lte: new Date(filters.endDate),
      };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const records = await prisma.attendance.findMany({
      where,
      include: {
        class: {
          select: {
            className: true,
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
      orderBy: {
        attendanceDate: 'desc',
      },
    });

    // Calculate statistics
    const stats = {
      total: records.length,
      present: records.filter(r => r.status === 'PRESENT').length,
      absent: records.filter(r => r.status === 'ABSENT').length,
      late: records.filter(r => r.status === 'LATE').length,
    };

    if (stats.total > 0) {
      stats.presentPercentage = ((stats.present / stats.total) * 100).toFixed(2);
      stats.absentPercentage = ((stats.absent / stats.total) * 100).toFixed(2);
      stats.latePercentage = ((stats.late / stats.total) * 100).toFixed(2);
    }

    return {
      records,
      statistics: stats,
    };
  }

  /**
   * Get attendance report for a class
   */
  async getClassAttendanceReport(classId, startDate, endDate, schoolId) {
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
      },
    });

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        classId,
        schoolId,
        attendanceDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
    });

    // Group by student
    const report = students.map(student => {
      const studentRecords = attendanceRecords.filter(r => r.studentId === student.studentId);
      
      const stats = {
        present: studentRecords.filter(r => r.status === 'PRESENT').length,
        absent: studentRecords.filter(r => r.status === 'ABSENT').length,
        late: studentRecords.filter(r => r.status === 'LATE').length,
        total: studentRecords.length,
      };

      if (stats.total > 0) {
        stats.attendanceRate = ((stats.present / stats.total) * 100).toFixed(2);
      } else {
        stats.attendanceRate = '0.00';
      }

      return {
        studentId: student.studentId,
        userId: student.user.userId,
        studentName: student.user.fullName,
        statistics: stats,
      };
    });

    return {
      students: report,
      dateRange: {
        from: formatDate(startDate),
        to: formatDate(endDate),
      },
    };
  }

  /**
   * Delete attendance record
   */
  async deleteAttendance(attendanceId, schoolId) {
    const attendance = await prisma.attendance.findFirst({
      where: {
        attendanceId,
        schoolId,
      },
    });

    if (!attendance) {
      throw new Error('Attendance record not found');
    }

    await prisma.attendance.delete({
      where: { attendanceId },
    });

    return attendance;
  }
}

module.exports = new AttendanceService();
