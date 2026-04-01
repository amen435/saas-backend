// src/services/timetableView.service.js

const prisma = require('../config/database');
const { ensurePeriodConfigurations } = require('../utils/seedPeriodConfig');

class TimetableViewService {
  async ensurePeriodConfigForYear(schoolId, academicYear) {
    await ensurePeriodConfigurations(prisma, schoolId, academicYear);
  }

  /**
   * Get timetable for a specific class
   * Used by: Students, Parents (for their child's class)
   */
  async getClassTimetable(classId, schoolId, academicYear) {
    await this.ensurePeriodConfigForYear(schoolId, academicYear);

    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: { classId, schoolId },
      select: {
        className: true,
        gradeLevel: true,
        section: true,
      },
    });

    if (!classData) {
      throw new Error('Class not found in this school');
    }

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

    // Get all timetable entries for this class
    const timetableEntries = await prisma.timetable.findMany({
      where: {
        classId,
        schoolId,
        academicYear,
        isActive: true,
      },
      include: {
        subject: {
          select: {
            subjectId: true,
            subjectName: true,
            subjectCode: true,
          },
        },
        teacher: {
          include: {
            user: {
              select: {
                userId: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { periodNumber: 'asc' },
      ],
    });

    // Fallback: if period config is missing, derive periods from existing timetable entries
    // so consumers can still render classes instead of an empty schedule.
    const effectivePeriods = periods.length
      ? periods
      : Array.from(
          timetableEntries.reduce((acc, entry) => {
            if (!acc.has(entry.periodNumber)) {
              acc.set(entry.periodNumber, {
                periodNumber: entry.periodNumber,
                periodName: `P${entry.periodNumber}`,
                startTime: entry.startTime,
                endTime: entry.endTime,
              });
            }
            return acc;
          }, new Map()).values()
        ).sort((a, b) => a.periodNumber - b.periodNumber);

    // Format timetable as a weekly schedule grid
    const schedule = this.formatWeeklySchedule(timetableEntries, effectivePeriods, breaks);

    return {
      class: classData,
      academicYear,
      periods: effectivePeriods,
      breaks,
      schedule,
      totalEntries: timetableEntries.length,
    };
  }

  /**
   * Get timetable for a specific teacher
   * Shows all classes the teacher teaches
   */
  async getTeacherTimetable(teacherId, schoolId, academicYear) {
    await this.ensurePeriodConfigForYear(schoolId, academicYear);

    // Verify teacher belongs to school
    const teacher = await prisma.teacher.findFirst({
      where: { teacherId, schoolId },
      include: {
        user: {
          select: {
            userId: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!teacher) {
      throw new Error('Teacher not found in this school');
    }

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

    // Get all timetable entries where this teacher is assigned
    const timetableEntries = await prisma.timetable.findMany({
      where: {
        teacherId,
        schoolId,
        academicYear,
        isActive: true,
      },
      include: {
        subject: {
          select: {
            subjectId: true,
            subjectName: true,
            subjectCode: true,
          },
        },
        class: {
          select: {
            classId: true,
            className: true,
            gradeLevel: true,
            section: true,
          },
        },
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { periodNumber: 'asc' },
      ],
    });

    // Format timetable
    const schedule = this.formatWeeklyScheduleForTeacher(timetableEntries, periods, breaks);

    return {
      teacher: {
        teacherId: teacher.teacherId,
        name: teacher.user.fullName,
        email: teacher.user.email,
        specialization: teacher.specialization,
      },
      academicYear,
      periods,
      breaks,
      schedule,
      totalClasses: timetableEntries.length,
    };
  }

  /**
   * Get timetable for a student (their class timetable)
   */
  async getStudentTimetable(studentId, schoolId, academicYear) {
    // Get student with class information
    const student = await prisma.student.findFirst({
      where: { studentId, schoolId },
      include: {
        user: {
          select: {
            userId: true,
            fullName: true,
          },
        },
        class: {
          select: {
            classId: true,
            className: true,
            gradeLevel: true,
            section: true,
          },
        },
      },
    });

    if (!student) {
      throw new Error('Student not found in this school');
    }

    if (!student.class) {
      throw new Error('Student is not assigned to any class');
    }

    // Get class timetable
    const timetable = await this.getClassTimetable(
      student.class.classId,
      schoolId,
      academicYear
    );

    return {
      student: {
        studentId: student.studentId,
        name: student.user.fullName,
        userId: student.user.userId,
      },
      ...timetable,
    };
  }

  /**
   * Get timetable for a parent's child
   */
  async getParentChildTimetable(parentId, studentId, schoolId, academicYear) {
    // Verify parent-child relationship
    const relationship = await prisma.parentStudent.findFirst({
      where: {
        parentId,
        studentId,
      },
      include: {
        parent: {
          where: { schoolId },
          include: {
            user: {
              select: {
                fullName: true,
              },
            },
          },
        },
        student: {
          where: { schoolId },
          include: {
            user: {
              select: {
                userId: true,
                fullName: true,
              },
            },
            class: {
              select: {
                classId: true,
                className: true,
                gradeLevel: true,
              },
            },
          },
        },
      },
    });

    if (!relationship || !relationship.parent || !relationship.student) {
      throw new Error('Student not found or not associated with this parent');
    }

    if (!relationship.student.class) {
      throw new Error('Student is not assigned to any class');
    }

    // Get class timetable
    const timetable = await this.getClassTimetable(
      relationship.student.class.classId,
      schoolId,
      academicYear
    );

    return {
      parent: {
        parentId: relationship.parent.parentId,
        name: relationship.parent.user.fullName,
      },
      student: {
        studentId: relationship.student.studentId,
        name: relationship.student.user.fullName,
        userId: relationship.student.user.userId,
      },
      ...timetable,
    };
  }

  /**
   * Get all children's timetables for a parent
   */
  async getAllChildrenTimetables(parentId, schoolId, academicYear) {
    const relationships = await prisma.parentStudent.findMany({
      where: { parentId },
      select: {
        student: {
          select: {
            studentId: true,
            classId: true,
            schoolId: true,
            user: {
              select: {
                userId: true,
                fullName: true,
              },
            },
            class: {
              select: {
                classId: true,
                className: true,
                gradeLevel: true,
                section: true,
              },
            },
          },
        },
      },
    });

    if (!relationships || relationships.length === 0) {
      return [];
    }

    const children = relationships
      .map((rel) => rel?.student)
      .filter((student) => student && student.schoolId === schoolId);

    if (!children || children.length === 0) {
      return [];
    }

    const childrenTimetables = [];

    for (const child of children) {
      const childClassId = child?.classId ?? child?.class?.classId ?? null;
      if (!childClassId) continue;

      try {
        const timetable = await this.getClassTimetable(
          childClassId,
          schoolId,
          academicYear
        );

        childrenTimetables.push({
          student: {
            studentId: child.studentId,
            name: child?.user?.fullName || null,
            userId: child?.user?.userId || null,
          },
          ...timetable,
        });
      } catch (error) {
        // Skip invalid/missing class data per child instead of failing all children.
        console.error('getAllChildrenTimetables child error:', error);
      }
    }

    return childrenTimetables;
  }

  /**
   * Format weekly schedule grid
   */
  formatWeeklySchedule(entries, periods, breaks) {
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const schedule = {};

    days.forEach(day => {
      schedule[day] = [];

      periods.forEach(period => {
        const entry = entries.find(
          e => e.dayOfWeek === day && e.periodNumber === period.periodNumber
        );

        if (entry) {
          schedule[day].push({
            type: 'class',
            periodNumber: period.periodNumber,
            periodName: period.periodName,
            timetableId: entry.timetableId,
            subject: {
              id: entry.subject.subjectId,
              name: entry.subject.subjectName,
              code: entry.subject.subjectCode,
            },
            teacher: {
              id: entry.teacher.teacherId,
              name: entry.teacher.user.fullName,
              email: entry.teacher.user.email,
            },
            room: entry.roomNumber,
            startTime: entry.startTime,
            endTime: entry.endTime,
          });
        } else {
          schedule[day].push({
            type: 'free',
            periodNumber: period.periodNumber,
            periodName: period.periodName,
            startTime: period.startTime,
            endTime: period.endTime,
          });
        }

        // Add break after this period if configured
        const breakAfter = breaks.find(b => b.afterPeriod === period.periodNumber);
        if (breakAfter) {
          schedule[day].push({
            type: 'break',
            name: breakAfter.breakName,
            startTime: breakAfter.startTime,
            endTime: breakAfter.endTime,
          });
        }
      });
    });

    return schedule;
  }

  /**
   * Format weekly schedule for teacher (includes class info)
   */
  formatWeeklyScheduleForTeacher(entries, periods, breaks) {
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const schedule = {};

    days.forEach(day => {
      schedule[day] = [];

      periods.forEach(period => {
        const entry = entries.find(
          e => e.dayOfWeek === day && e.periodNumber === period.periodNumber
        );

        if (entry) {
          schedule[day].push({
            type: 'class',
            periodNumber: period.periodNumber,
            periodName: period.periodName,
            timetableId: entry.timetableId,
            subject: {
              id: entry.subject.subjectId,
              name: entry.subject.subjectName,
              code: entry.subject.subjectCode,
            },
            class: {
              id: entry.class.classId,
              name: entry.class.className,
              grade: entry.class.gradeLevel,
              section: entry.class.section,
            },
            room: entry.roomNumber,
            startTime: entry.startTime,
            endTime: entry.endTime,
          });
        } else {
          schedule[day].push({
            type: 'free',
            periodNumber: period.periodNumber,
            periodName: period.periodName,
            startTime: period.startTime,
            endTime: period.endTime,
          });
        }

        // Add break
        const breakAfter = breaks.find(b => b.afterPeriod === period.periodNumber);
        if (breakAfter) {
          schedule[day].push({
            type: 'break',
            name: breakAfter.breakName,
            startTime: breakAfter.startTime,
            endTime: breakAfter.endTime,
          });
        }
      });
    });

    return schedule;
  }

  /**
   * Get timetable summary for a specific day
   */
  async getDayTimetable(classId, dayOfWeek, schoolId, academicYear) {
    const entries = await prisma.timetable.findMany({
      where: {
        classId,
        dayOfWeek,
        schoolId,
        academicYear,
        isActive: true,
      },
      include: {
        subject: true,
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
        periodNumber: 'asc',
      },
    });

    return entries.map(e => ({
      periodNumber: e.periodNumber,
      subject: e.subject.subjectName,
      teacher: e.teacher.user.fullName,
      room: e.roomNumber,
      time: `${e.startTime} - ${e.endTime}`,
    }));
  }
}

module.exports = new TimetableViewService();
