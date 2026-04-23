const prisma = require('../config/database');
const { generateFaceEmbedding } = require('./faceEmbedding.service');
const { findBestEmbeddingMatch } = require('../utils/embeddingSimilarity.utils');
const { emitSocketEvent } = require('./socket.service');
const { sendSmsNotification } = require('./notification.service');

const DEFAULT_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 0.65);
const DEFAULT_GRACE_MINUTES = Number(process.env.ATTENDANCE_GRACE_MINUTES || 10);
const ATTENDANCE_TIMEZONE = String(process.env.ATTENDANCE_TIMEZONE || 'Africa/Nairobi');

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function createHttpError(statusCode, message, details) {
  return Object.assign(new Error(message), { statusCode, details });
}

function formatDateParts(timestamp) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATTENDANCE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'long',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(timestamp).map((part) => [part.type, part.value])
  );

  const weekday = String(parts.weekday || '').toUpperCase();
  const normalizedDay = DAY_NAMES.find((value) => value === weekday) || 'MONDAY';

  return {
    dayOfWeek: normalizedDay,
    dateOnly: `${parts.year}-${parts.month}-${parts.day}`,
    timeOnly: `${parts.hour}:${parts.minute}`,
    isoTimestamp: timestamp.toISOString(),
  };
}

function addMinutesToTime(timeValue, minutes) {
  const [hours, mins] = String(timeValue || '00:00').split(':').map((value) => Number.parseInt(value, 10) || 0);
  const total = hours * 60 + mins + minutes;
  const nextHours = Math.floor(total / 60) % 24;
  const nextMinutes = total % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}

function buildPersonResponse(person) {
  return {
    id: person.userId,
    name: person.name,
    role: person.role,
    class: person.className,
  };
}

function buildAttendanceResponse(record, timestamp) {
  if (!record) return null;

  return {
    status: record.status,
    timetableId: record.timetableId,
    timestamp: timestamp,
  };
}

async function resolveRecognitionContext(payload) {
  const rawDeviceId = String(payload.deviceId || '').trim();
  if (rawDeviceId) {
    const device = await prisma.device.findFirst({
      where: {
        deviceId: rawDeviceId,
        isActive: true,
      },
      include: {
        class: {
          select: {
            classId: true,
            className: true,
            academicYear: true,
          },
        },
      },
    });

    if (!device) {
      throw createHttpError(404, 'Active device not found.');
    }

    return device;
  }

  const classId = Number.parseInt(String(payload.classId || ''), 10);
  if (!Number.isInteger(classId) || classId <= 0) {
    throw createHttpError(400, 'classId must be a valid positive integer.');
  }

  const classRecord = await prisma.class.findFirst({
    where: {
      classId,
      isActive: true,
    },
    select: {
      classId: true,
      className: true,
      academicYear: true,
      schoolId: true,
    },
  });

  if (!classRecord) {
    throw createHttpError(404, 'Active class not found.');
  }

  return {
    deviceId: `WEBCAM-CLASS-${classRecord.classId}`,
    deviceType: 'WEBCAM',
    schoolId: classRecord.schoolId,
    classId: classRecord.classId,
    class: classRecord,
  };
}

class AttendanceRecognitionService {
  async recognize(payload) {
    const recognitionTime = payload.timestamp ? new Date(payload.timestamp) : new Date();
    if (Number.isNaN(recognitionTime.getTime())) {
      throw createHttpError(400, 'timestamp must be a valid ISO8601 value.');
    }

    const device = await resolveRecognitionContext(payload);

    const currentSlot = formatDateParts(recognitionTime);
    const currentTimetable = await prisma.timetable.findFirst({
      where: {
        schoolId: device.schoolId,
        classId: device.classId,
        academicYear: device.class.academicYear,
        isActive: true,
        dayOfWeek: currentSlot.dayOfWeek,
        startTime: { lte: currentSlot.timeOnly },
        endTime: { gte: currentSlot.timeOnly },
      },
      include: {
        class: {
          select: {
            classId: true,
            className: true,
          },
        },
        teacher: {
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
    });

    const biometric = await generateFaceEmbedding(payload.imageBase64);
    const [students, teachers] = await Promise.all([
      prisma.student.findMany({
        where: {
          schoolId: device.schoolId,
          isActive: true,
        },
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
            },
          },
          parents: {
            where: {
              parent: { isActive: true },
            },
            include: {
              parent: {
                include: {
                  user: {
                    select: {
                      phone: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              isPrimary: 'desc',
            },
          },
        },
      }),
      prisma.teacher.findMany({
        where: {
          schoolId: device.schoolId,
          isActive: true,
        },
        include: {
          user: {
            select: {
              userId: true,
              fullName: true,
            },
          },
          homeroomClasses: {
            select: {
              className: true,
            },
            take: 1,
          },
        },
      }),
    ]);

    const candidates = [
      ...students.map((student) => ({
        role: 'STUDENT',
        userId: student.user.userId,
        recordId: student.studentId,
        name: student.user.fullName,
        classId: student.classId,
        className: student.class.className,
        embedding: student.faceEmbedding,
        guardianPhone: student.guardianPhone,
        parentPhone:
          student.parents.find((item) => item.parent?.phoneNumber || item.parent?.user?.phone)?.parent?.phoneNumber
          || student.parents.find((item) => item.parent?.user?.phone)?.parent?.user?.phone
          || null,
      })),
      ...teachers.map((teacher) => ({
        role: teacher.user.role,
        userId: teacher.user.userId,
        recordId: teacher.teacherId,
        name: teacher.user.fullName,
        classId: teacher.classId || null,
        className: teacher.homeroomClasses[0]?.className || device.class.className,
        embedding: teacher.faceEmbedding,
      })),
    ];

    const match = findBestEmbeddingMatch(
      biometric.faceEmbedding,
      candidates,
      DEFAULT_MATCH_THRESHOLD
    );

    if (!match) {
      const alert = await this.createAlert({
        schoolId: device.schoolId,
        classId: device.classId,
        type: 'UNKNOWN_PERSON',
        message: `Unknown person detected on device ${device.deviceId} for ${device.class.className}.`,
      });

      throw createHttpError(404, 'No matching face found.', { alert });
    }

    if (match.role === 'STUDENT') {
      return this.handleStudentRecognition({
        device,
        currentTimetable,
        currentSlot,
        match,
        recognitionTime,
      });
    }

    return this.handleTeacherRecognition({
      device,
      currentTimetable,
      currentSlot,
      match,
      recognitionTime,
    });
  }

  determineAttendanceStatus(startTime, currentTime) {
    const lateBoundary = addMinutesToTime(startTime, DEFAULT_GRACE_MINUTES);
    return currentTime > lateBoundary ? 'LATE' : 'PRESENT';
  }

  async createAlert(data) {
    const alert = await prisma.alert.create({
      data,
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
          },
        },
      },
    });

    emitSocketEvent('alert:created', alert);
    return alert;
  }

  async handleStudentRecognition({ device, currentTimetable, currentSlot, match, recognitionTime }) {
    if (match.classId !== device.classId) {
      const alert = await this.createAlert({
        schoolId: device.schoolId,
        userId: match.userId,
        classId: device.classId,
        type: 'WRONG_CLASS',
        message: `${match.name} was detected in ${device.class.className} but belongs to another class.`,
      });

      await this.sendParentAttendanceNotification(match, 'WRONG_CLASS', device.class.className);
      throw createHttpError(409, 'Student detected in the wrong class.', {
        person: buildPersonResponse(match),
        alert,
      });
    }

    if (!currentTimetable) {
      throw createHttpError(409, 'No active timetable entry is scheduled for this class at the current time.');
    }

    const status = this.determineAttendanceStatus(currentTimetable.startTime, currentSlot.timeOnly);
    const attendance = await prisma.attendance.upsert({
      where: {
        studentId_timetableId: {
          studentId: match.recordId,
          timetableId: currentTimetable.timetableId,
        },
      },
      update: {
        status,
        method: device.deviceType,
        similarityScore: match.similarityScore,
        teacherId: currentTimetable.teacherId,
        classId: device.classId,
        attendanceDate: new Date(currentSlot.dateOnly),
      },
      create: {
        studentId: match.recordId,
        classId: device.classId,
        schoolId: device.schoolId,
        teacherId: currentTimetable.teacherId,
        timetableId: currentTimetable.timetableId,
        attendanceDate: new Date(currentSlot.dateOnly),
        status,
        method: device.deviceType,
        similarityScore: match.similarityScore,
      },
    });

    await this.sendParentAttendanceNotification(match, status, device.class.className);

    const response = {
      success: true,
      person: buildPersonResponse(match),
      attendance: buildAttendanceResponse(attendance, recognitionTime.toISOString()),
      alert: null,
    };

    emitSocketEvent('attendance:recorded', response);
    return response;
  }

  async handleTeacherRecognition({ device, currentTimetable, currentSlot, match, recognitionTime }) {
    if (!currentTimetable || currentTimetable.teacherId !== match.recordId) {
      const alert = await this.createAlert({
        schoolId: device.schoolId,
        userId: match.userId,
        classId: device.classId,
        type: 'UNAUTHORIZED_TEACHER',
        message: `${match.name} is not scheduled for ${device.class.className} at this time.`,
      });

      throw createHttpError(403, 'Teacher is not scheduled for the current period.', {
        person: buildPersonResponse(match),
        alert,
      });
    }

    const status = this.determineAttendanceStatus(currentTimetable.startTime, currentSlot.timeOnly);
    const attendance = await prisma.teacherAttendance.upsert({
      where: {
        teacherId_timetableId: {
          teacherId: match.recordId,
          timetableId: currentTimetable.timetableId,
        },
      },
      update: {
        status,
        classId: device.classId,
        attendanceDate: new Date(currentSlot.dateOnly),
        method: device.deviceType,
        similarityScore: match.similarityScore,
        recordedBy: currentTimetable.teacher.user.userId,
      },
      create: {
        teacherId: match.recordId,
        schoolId: device.schoolId,
        classId: device.classId,
        timetableId: currentTimetable.timetableId,
        attendanceDate: new Date(currentSlot.dateOnly),
        status,
        method: device.deviceType,
        similarityScore: match.similarityScore,
        recordedBy: currentTimetable.teacher.user.userId,
      },
    });

    const response = {
      success: true,
      person: buildPersonResponse(match),
      attendance: buildAttendanceResponse(attendance, recognitionTime.toISOString()),
      alert: null,
    };

    emitSocketEvent('attendance:recorded', response);
    return response;
  }

  async sendParentAttendanceNotification(match, status, detectedClassName) {
    if (match.role !== 'STUDENT') {
      return { sent: false, skipped: true, reason: 'Only students trigger parent notifications.' };
    }

    const targetPhone = match.parentPhone || match.guardianPhone;
    const message =
      status === 'WRONG_CLASS'
        ? `${match.name} was detected in ${detectedClassName} but is assigned to ${match.className}.`
        : `${match.name} was marked ${status} for ${detectedClassName}.`;

    try {
      return await sendSmsNotification({
        to: targetPhone,
        body: message,
      });
    } catch (error) {
      return {
        sent: false,
        skipped: false,
        reason: error.message,
      };
    }
  }
}

module.exports = new AttendanceRecognitionService();
