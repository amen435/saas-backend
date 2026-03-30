// src/services/subject.service.js

const prisma = require('../config/database');

class SubjectService {
  /**
   * Get all subjects for a school
   */
  async getAllSubjects(schoolId, filters = {}) {
    const where = {
      schoolId,
      isActive: true,
    };

    if (filters.search) {
      where.OR = [
        { subjectName: { contains: filters.search } },
        { subjectCode: { contains: filters.search } },
      ];
    }

    const subjects = await prisma.subject.findMany({
      where,
      include: {
        teachers: {
          include: {
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
        },
        _count: {
          select: {
            teachers: true,
          },
        },
      },
      orderBy: {
        subjectName: 'asc',
      },
    });

    return subjects;
  }

  /**
   * Get subject by ID
   */
  async getSubjectById(subjectId, schoolId) {
    const subject = await prisma.subject.findFirst({
      where: {
        subjectId,
        schoolId,
      },
      include: {
        teachers: {
          include: {
            teacher: {
              include: {
                user: {
                  select: {
                    userId: true,
                    fullName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        school: {
          select: {
            schoolId: true,
            schoolName: true,
            schoolCode: true,
          },
        },
      },
    });

    return subject;
  }

  /**
   * Create subject
   */
  async createSubject(data, schoolId) {
    // Check if subject code already exists in this school
    const existing = await prisma.subject.findFirst({
      where: {
        schoolId,
        subjectCode: data.subjectCode,
      },
    });

    if (existing) {
      throw new Error('Subject code already exists in this school');
    }

    const subject = await prisma.subject.create({
      data: {
        subjectName: data.subjectName,
        subjectCode: data.subjectCode,
        description: data.description,
        schoolId,
      },
      include: {
        _count: {
          select: {
            teachers: true,
          },
        },
      },
    });

    return subject;
  }

  /**
   * Update subject
   */
  async updateSubject(subjectId, data, schoolId) {
    // Verify subject belongs to school
    const subject = await prisma.subject.findFirst({
      where: {
        subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    // Check if new code conflicts
    if (data.subjectCode && data.subjectCode !== subject.subjectCode) {
      const existing = await prisma.subject.findFirst({
        where: {
          schoolId,
          subjectCode: data.subjectCode,
          NOT: {
            subjectId,
          },
        },
      });

      if (existing) {
        throw new Error('Subject code already exists in this school');
      }
    }

    const updated = await prisma.subject.update({
      where: { subjectId },
      data: {
        subjectName: data.subjectName || subject.subjectName,
        subjectCode: data.subjectCode || subject.subjectCode,
        description: data.description !== undefined ? data.description : subject.description,
      },
      include: {
        teachers: {
          include: {
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
        },
        _count: {
          select: {
            teachers: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Delete subject
   */
  async deleteSubject(subjectId, schoolId) {
    const subject = await prisma.subject.findFirst({
      where: {
        subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    await prisma.subject.delete({
      where: { subjectId },
    });

    return subject;
  }

  /**
   * Assign teacher to subject
   */
  async assignTeacher(subjectId, teacherId, schoolId) {
    // Verify subject belongs to school
    const subject = await prisma.subject.findFirst({
      where: {
        subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    // Verify teacher belongs to same school
    const teacher = await prisma.teacher.findFirst({
      where: {
        teacherId,
        schoolId,
      },
    });

    if (!teacher) {
      throw new Error('Teacher not found or does not belong to this school');
    }

    // Check if already assigned
    const existing = await prisma.subjectTeacher.findFirst({
      where: {
        subjectId,
        teacherId,
      },
    });

    if (existing) {
      throw new Error('Teacher is already assigned to this subject');
    }

    // Create assignment
    const assignment = await prisma.subjectTeacher.create({
      data: {
        subjectId,
        teacherId,
      },
      include: {
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
        subject: {
          select: {
            subjectId: true,
            subjectName: true,
            subjectCode: true,
          },
        },
      },
    });

    return assignment;
  }

  /**
   * Remove teacher from subject
   */
  async removeTeacher(subjectId, teacherId, schoolId) {
    // Verify subject belongs to school
    const subject = await prisma.subject.findFirst({
      where: {
        subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    // Find assignment
    const assignment = await prisma.subjectTeacher.findFirst({
      where: {
        subjectId,
        teacherId,
      },
    });

    if (!assignment) {
      throw new Error('Teacher is not assigned to this subject');
    }

    // Remove assignment
    await prisma.subjectTeacher.delete({
      where: {
        id: assignment.id,
      },
    });

    return assignment;
  }

  /**
   * Get all teachers in a school (for assignment dropdown)
   */
  async getSchoolTeachers(schoolId) {
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
        subjects: {
          include: {
            subject: {
              select: {
                subjectName: true,
              },
            },
          },
        },
      },
      orderBy: {
        user: {
          fullName: 'asc',
        },
      },
    });

    return teachers;
  }
}

module.exports = new SubjectService();