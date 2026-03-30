// src/services/attendance.service.js

const prisma = require('../config/database');
const { formatDate } = require('../utils/attendanceValidation');

class AttendanceService {
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