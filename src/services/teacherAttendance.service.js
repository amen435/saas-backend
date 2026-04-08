// src/services/teacherAttendance.service.js

const prisma = require('../config/database');
const { formatDate } = require('../utils/teacherAttendanceValidation');

class TeacherAttendanceService {
  /**
   * Record attendance for a single teacher
   */
  async recordTeacherAttendance(data, schoolId, recordedBy) {
    const { teacherId, attendanceDate, status, remarks } = data;

    // Verify teacher belongs to the school
    const teacher = await prisma.teacher.findFirst({
      where: {
        teacherId,
        schoolId,
      },
      include: {
        user: {
          select: {
            fullName: true,
            userId: true,
          },
        },
      },
    });

    if (!teacher) {
      throw new Error('Teacher not found in this school');
    }

    // Upsert attendance (update if exists, create if not)
    const attendance = await prisma.teacherAttendance.upsert({
      where: {
        teacherId_attendanceDate: {
          teacherId,
          attendanceDate: new Date(attendanceDate),
        },
      },
      update: {
        status,
        remarks: remarks || null,
        recordedBy,
      },
      create: {
        teacherId,
        schoolId,
        attendanceDate: new Date(attendanceDate),
        status,
        remarks: remarks || null,
        recordedBy,
      },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                fullName: true,
                userId: true,
              },
            },
          },
        },
        recorder: {
          select: {
            fullName: true,
          },
        },
      },
    });

    return attendance;
  }

  /**
   * Record bulk attendance for multiple teachers
   */
  async recordBulkTeacherAttendance(attendanceDate, records, schoolId, recordedBy) {
    // Get all teachers in the school
    const teachers = await prisma.teacher.findMany({
      where: {
        schoolId,
        isActive: true,
      },
    });

    const teacherIds = teachers.map(t => t.teacherId);

    // Validate all teacher IDs belong to this school
    const invalidTeachers = records.filter(r => !teacherIds.includes(r.teacherId));
    if (invalidTeachers.length > 0) {
      throw new Error(`Invalid teacher IDs: ${invalidTeachers.map(t => t.teacherId).join(', ')}`);
    }

    // Create/update attendance records
    const results = await prisma.$transaction(
      records.map(record =>
        prisma.teacherAttendance.upsert({
          where: {
            teacherId_attendanceDate: {
              teacherId: record.teacherId,
              attendanceDate: new Date(attendanceDate),
            },
          },
          update: {
            status: record.status,
            remarks: record.remarks || null,
            recordedBy,
          },
          create: {
            teacherId: record.teacherId,
            schoolId,
            attendanceDate: new Date(attendanceDate),
            status: record.status,
            remarks: record.remarks || null,
            recordedBy,
          },
        })
      )
    );

    return results;
  }

  /**
   * Get attendance for all teachers on a specific date
   */
  async getSchoolTeacherAttendance(schoolId, attendanceDate) {
    // Get all active teachers in the school
    const teachers = await prisma.teacher.findMany({
      where: {
        schoolId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            userId: true,
            fullName: true,
            email: true,
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
    const attendanceRecords = await prisma.teacherAttendance.findMany({
      where: {
        schoolId,
        attendanceDate: new Date(attendanceDate),
      },
      include: {
        recorder: {
          select: {
            fullName: true,
          },
        },
      },
    });

    // Map teachers with their attendance
    const teachersWithAttendance = teachers.map(teacher => {
      const attendance = attendanceRecords.find(a => a.teacherId === teacher.teacherId);
      
      return {
        teacherId: teacher.teacherId,
        userId: teacher.user.userId,
        teacherName: teacher.user.fullName,
        email: teacher.user.email,
        specialization: teacher.specialization,
        status: attendance ? attendance.status : null,
        remarks: attendance ? attendance.remarks : null,
        hasAttendance: !!attendance,
        attendanceId: attendance ? attendance.teacherAttendanceId : null,
        recordedBy: attendance ? attendance.recorder.fullName : null,
      };
    });

    // Calculate summary
    const summary = {
      total: teachers.length,
      present: attendanceRecords.filter(a => a.status === 'PRESENT').length,
      absent: attendanceRecords.filter(a => a.status === 'ABSENT').length,
      late: attendanceRecords.filter(a => a.status === 'LATE').length,
      notRecorded: teachers.length - attendanceRecords.length,
    };

    return {
      teachers: teachersWithAttendance,
      summary,
      date: formatDate(attendanceDate),
    };
  }

  /**
   * Get attendance history for a specific teacher
   */
  async getTeacherAttendanceHistory(teacherId, schoolId, filters = {}) {
    // Verify teacher belongs to school
    const teacher = await prisma.teacher.findFirst({
      where: {
        teacherId,
        schoolId,
      },
      include: {
        user: {
          select: {
            fullName: true,
            userId: true,
          },
        },
      },
    });

    if (!teacher) {
      throw new Error('Teacher not found in this school');
    }

    const where = {
      teacherId,
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

    const records = await prisma.teacherAttendance.findMany({
      where,
      include: {
        recorder: {
          select: {
            fullName: true,
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
      stats.attendanceRate = (((stats.present + stats.late) / stats.total) * 100).toFixed(2);
    } else {
      stats.presentPercentage = '0.00';
      stats.absentPercentage = '0.00';
      stats.latePercentage = '0.00';
      stats.attendanceRate = '0.00';
    }

    return {
      teacher: {
        teacherId: teacher.teacherId,
        teacherName: teacher.user.fullName,
        userId: teacher.user.userId,
        specialization: teacher.specialization,
      },
      records,
      statistics: stats,
    };
  }

  /**
   * Get attendance report for all teachers
   */
  async getSchoolAttendanceReport(schoolId, startDate, endDate) {
    const teachers = await prisma.teacher.findMany({
      where: {
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

    const attendanceRecords = await prisma.teacherAttendance.findMany({
      where: {
        schoolId,
        attendanceDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
    });

    // Group by teacher
    const report = teachers.map(teacher => {
      const teacherRecords = attendanceRecords.filter(r => r.teacherId === teacher.teacherId);
      
      const stats = {
        present: teacherRecords.filter(r => r.status === 'PRESENT').length,
        absent: teacherRecords.filter(r => r.status === 'ABSENT').length,
        late: teacherRecords.filter(r => r.status === 'LATE').length,
        total: teacherRecords.length,
      };

      if (stats.total > 0) {
        stats.attendanceRate = (((stats.present + stats.late) / stats.total) * 100).toFixed(2);
        stats.presentPercentage = ((stats.present / stats.total) * 100).toFixed(2);
      } else {
        stats.attendanceRate = '0.00';
        stats.presentPercentage = '0.00';
      }

      return {
        teacherId: teacher.teacherId,
        userId: teacher.user.userId,
        teacherName: teacher.user.fullName,
        specialization: teacher.specialization,
        statistics: stats,
      };
    });

    return {
      teachers: report,
      dateRange: {
        from: formatDate(startDate),
        to: formatDate(endDate),
      },
    };
  }

  /**
   * Update teacher attendance
   */
  async updateTeacherAttendance(attendanceId, data, schoolId, recordedBy) {
    const attendance = await prisma.teacherAttendance.findFirst({
      where: {
        teacherAttendanceId: attendanceId,
        schoolId,
      },
    });

    if (!attendance) {
      throw new Error('Attendance record not found');
    }

    const updated = await prisma.teacherAttendance.update({
      where: {
        teacherAttendanceId: attendanceId,
      },
      data: {
        status: data.status || attendance.status,
        remarks: data.remarks !== undefined ? data.remarks : attendance.remarks,
        recordedBy,
      },
      include: {
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

    return updated;
  }

  /**
   * Delete teacher attendance record
   */
  async deleteTeacherAttendance(attendanceId, schoolId) {
    const attendance = await prisma.teacherAttendance.findFirst({
      where: {
        teacherAttendanceId: attendanceId,
        schoolId,
      },
    });

    if (!attendance) {
      throw new Error('Attendance record not found');
    }

    await prisma.teacherAttendance.delete({
      where: {
        teacherAttendanceId: attendanceId,
      },
    });

    return attendance;
  }
}

module.exports = new TeacherAttendanceService();