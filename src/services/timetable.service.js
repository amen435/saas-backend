// src/services/timetable.service.js

const prisma = require('../config/database');
const { ensurePeriodConfigurations } = require('../utils/seedPeriodConfig');

class TimetableService {
  async ensurePeriodConfigForYear(schoolId, academicYear) {
    await ensurePeriodConfigurations(prisma, schoolId, academicYear);
  }

  /**
   * Check for conflicts before creating/updating timetable
   */
  async checkConflicts(data, schoolId, excludeTimetableId = null) {
    const { classId, teacherId, dayOfWeek, periodNumber, academicYear } = data;

    const where = {
      schoolId,
      dayOfWeek,
      periodNumber,
      academicYear,
      isActive: true,
    };

    if (excludeTimetableId) {
      where.NOT = { timetableId: excludeTimetableId };
    }

    const existingEntries = await prisma.timetable.findMany({ where });

    const conflicts = [];

    existingEntries.forEach(entry => {
      // Check for class conflict
      if (entry.classId === classId) {
        conflicts.push({
          type: 'CLASS_CONFLICT',
          message: `This class already has a subject scheduled for ${dayOfWeek} Period ${periodNumber}`,
          conflict: entry,
        });
      }

      // Check for teacher conflict
      if (entry.teacherId === teacherId) {
        conflicts.push({
          type: 'TEACHER_CONFLICT',
          message: `This teacher is already teaching another class during ${dayOfWeek} Period ${periodNumber}`,
          conflict: entry,
        });
      }
    });

    return conflicts;
  }

  /**
   * Create timetable entry
   */
  async createTimetable(data, schoolId, createdBy) {
    await this.ensurePeriodConfigForYear(schoolId, data.academicYear);

    // Verify class, subject, and teacher belong to the school
    const [classData, subject, teacher] = await Promise.all([
      prisma.class.findFirst({
        where: { classId: data.classId, schoolId },
      }),
      prisma.subject.findFirst({
        where: { subjectId: data.subjectId, schoolId },
      }),
      prisma.teacher.findFirst({
        where: { teacherId: data.teacherId, schoolId },
      }),
    ]);

    if (!classData) throw new Error('Class not found in this school');
    if (!subject) throw new Error('Subject not found in this school');
    if (!teacher) throw new Error('Teacher not found in this school');

    // Get period configuration
    const periodConfig = await prisma.periodConfiguration.findFirst({
      where: {
        schoolId,
        periodNumber: data.periodNumber,
        academicYear: data.academicYear,
      },
    });

    if (!periodConfig) {
      throw new Error(`Period ${data.periodNumber} not configured for this school`);
    }

    // Check for conflicts
    const conflicts = await this.checkConflicts(data, schoolId);
    if (conflicts.length > 0) {
      const error = new Error('Timetable conflicts detected');
      error.conflicts = conflicts;
      throw error;
    }

    // Create timetable entry
    const timetable = await prisma.timetable.create({
      data: {
        schoolId,
        classId: data.classId,
        subjectId: data.subjectId,
        teacherId: data.teacherId,
        dayOfWeek: data.dayOfWeek,
        periodNumber: data.periodNumber,
        startTime: periodConfig.startTime,
        endTime: periodConfig.endTime,
        roomNumber: data.roomNumber || null,
        academicYear: data.academicYear,
        createdBy,
      },
      include: {
        class: {
          select: {
            className: true,
            gradeLevel: true,
          },
        },
        subject: {
          select: {
            subjectName: true,
            subjectCode: true,
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

    return timetable;
  }

  /**
   * Get timetable by class (formatted for frontend grid)
   */
  async getTimetableByClass(classId, schoolId, academicYear) {
    await this.ensurePeriodConfigForYear(schoolId, academicYear);

    // Get period configurations
    const periods = await prisma.periodConfiguration.findMany({
      where: { schoolId, academicYear, isActive: true },
      orderBy: { periodNumber: 'asc' },
    });

    // Get break configurations
    const breaks = await prisma.breakConfiguration.findMany({
      where: { schoolId, academicYear, isActive: true },
      orderBy: { afterPeriod: 'asc' },
    });

    // Get timetable entries
    const timetable = await prisma.timetable.findMany({
      where: {
        classId,
        schoolId,
        academicYear,
        isActive: true,
      },
      include: {
        subject: {
          select: {
            subjectName: true,
            subjectCode: true,
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

    // Get class info
    const classInfo = await prisma.class.findFirst({
      where: { classId, schoolId },
      select: {
        className: true,
        gradeLevel: true,
      },
    });

    // Format data for frontend grid
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const schedule = {};

    days.forEach(day => {
      schedule[day] = {};
      
      periods.forEach(period => {
        const entry = timetable.find(
          t => t.dayOfWeek === day && t.periodNumber === period.periodNumber
        );

        if (entry) {
          schedule[day][`P${period.periodNumber}`] = {
            timetableId: entry.timetableId,
            subject: entry.subject.subjectName,
            subjectCode: entry.subject.subjectCode,
            teacher: entry.teacher.user.fullName,
            room: entry.roomNumber,
            startTime: entry.startTime,
            endTime: entry.endTime,
            periodNumber: period.periodNumber,
          };
        } else {
          schedule[day][`P${period.periodNumber}`] = {
            status: 'Free',
            periodNumber: period.periodNumber,
            startTime: period.startTime,
            endTime: period.endTime,
          };
        }
      });

      // Add breaks
      breaks.forEach(breakItem => {
        schedule[day][breakItem.breakName] = {
          type: 'break',
          name: breakItem.breakName,
          startTime: breakItem.startTime,
          endTime: breakItem.endTime,
        };
      });
    });

    return {
      class: classInfo,
      periods,
      breaks,
      schedule,
    };
  }

  /**
   * Get timetable by teacher (formatted for frontend grid)
   */
  async getTimetableByTeacher(teacherId, schoolId, academicYear) {
    await this.ensurePeriodConfigForYear(schoolId, academicYear);

    const periods = await prisma.periodConfiguration.findMany({
      where: { schoolId, academicYear, isActive: true },
      orderBy: { periodNumber: 'asc' },
    });

    const breaks = await prisma.breakConfiguration.findMany({
      where: { schoolId, academicYear, isActive: true },
      orderBy: { afterPeriod: 'asc' },
    });

    const timetable = await prisma.timetable.findMany({
      where: {
        teacherId,
        schoolId,
        academicYear,
        isActive: true,
      },
      include: {
        class: {
          select: {
            className: true,
            gradeLevel: true,
          },
        },
        subject: {
          select: {
            subjectName: true,
            subjectCode: true,
          },
        },
      },
    });

    const teacherInfo = await prisma.teacher.findFirst({
      where: { teacherId, schoolId },
      include: {
        user: {
          select: {
            fullName: true,
          },
        },
      },
    });

    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const schedule = {};

    days.forEach(day => {
      schedule[day] = {};
      
      periods.forEach(period => {
        const entry = timetable.find(
          t => t.dayOfWeek === day && t.periodNumber === period.periodNumber
        );

        if (entry) {
          schedule[day][`P${period.periodNumber}`] = {
            timetableId: entry.timetableId,
            subject: entry.subject.subjectName,
            subjectCode: entry.subject.subjectCode,
            class: entry.class.className,
            grade: entry.class.gradeLevel,
            room: entry.roomNumber,
            startTime: entry.startTime,
            endTime: entry.endTime,
            periodNumber: period.periodNumber,
          };
        } else {
          schedule[day][`P${period.periodNumber}`] = {
            status: 'Free',
            periodNumber: period.periodNumber,
            startTime: period.startTime,
            endTime: period.endTime,
          };
        }
      });

      breaks.forEach(breakItem => {
        schedule[day][breakItem.breakName] = {
          type: 'break',
          name: breakItem.breakName,
          startTime: breakItem.startTime,
          endTime: breakItem.endTime,
        };
      });
    });

    return {
      teacher: {
        name: teacherInfo.user.fullName,
        teacherId,
      },
      periods,
      breaks,
      schedule,
    };
  }

  /**
   * Update timetable entry
   */
  async updateTimetable(timetableId, data, schoolId) {
    const existing = await prisma.timetable.findFirst({
      where: { timetableId, schoolId },
    });

    if (!existing) throw new Error('Timetable entry not found');
    await this.ensurePeriodConfigForYear(schoolId, data.academicYear || existing.academicYear);

    // If period changed, get new period config
    let startTime = existing.startTime;
    let endTime = existing.endTime;

    if (data.periodNumber && data.periodNumber !== existing.periodNumber) {
      const periodConfig = await prisma.periodConfiguration.findFirst({
        where: {
          schoolId,
          periodNumber: data.periodNumber,
          academicYear: data.academicYear || existing.academicYear,
        },
      });

      if (!periodConfig) {
        throw new Error(`Period ${data.periodNumber} not configured`);
      }

      startTime = periodConfig.startTime;
      endTime = periodConfig.endTime;
    }

    // Check for conflicts
    const conflicts = await this.checkConflicts(
      {
        classId: data.classId || existing.classId,
        teacherId: data.teacherId || existing.teacherId,
        dayOfWeek: data.dayOfWeek || existing.dayOfWeek,
        periodNumber: data.periodNumber || existing.periodNumber,
        academicYear: data.academicYear || existing.academicYear,
      },
      schoolId,
      timetableId
    );

    if (conflicts.length > 0) {
      const error = new Error('Timetable conflicts detected');
      error.conflicts = conflicts;
      throw error;
    }

    const updated = await prisma.timetable.update({
      where: { timetableId },
      data: {
        classId: data.classId || existing.classId,
        subjectId: data.subjectId || existing.subjectId,
        teacherId: data.teacherId || existing.teacherId,
        dayOfWeek: data.dayOfWeek || existing.dayOfWeek,
        periodNumber: data.periodNumber || existing.periodNumber,
        startTime,
        endTime,
        roomNumber: data.roomNumber !== undefined ? data.roomNumber : existing.roomNumber,
        academicYear: data.academicYear || existing.academicYear,
      },
      include: {
        class: { select: { className: true } },
        subject: { select: { subjectName: true } },
        teacher: {
          include: {
            user: { select: { fullName: true } },
          },
        },
      },
    });

    return updated;
  }

  /**
   * Delete timetable entry
   */
  async deleteTimetable(timetableId, schoolId) {
    const timetable = await prisma.timetable.findFirst({
      where: { timetableId, schoolId },
    });

    if (!timetable) throw new Error('Timetable entry not found');

    await prisma.timetable.delete({
      where: { timetableId },
    });

    return timetable;
  }

  /**
   * Get period configurations
   */
  async getPeriodConfigurations(schoolId, academicYear) {
    await this.ensurePeriodConfigForYear(schoolId, academicYear);

    const periods = await prisma.periodConfiguration.findMany({
      where: { schoolId, academicYear, isActive: true },
      orderBy: { periodNumber: 'asc' },
    });

    const breaks = await prisma.breakConfiguration.findMany({
      where: { schoolId, academicYear, isActive: true },
      orderBy: { afterPeriod: 'asc' },
    });

    return { periods, breaks };
  }
}

module.exports = new TimetableService();
