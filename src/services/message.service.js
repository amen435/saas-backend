// src/services/message.service.js

const prisma = require('../config/database');

class MessageService {
  /**
   * Send a message
   */
  async sendMessage(senderId, receiverId, content, schoolId) {
    // Verify both users belong to the same school
    const sender = await prisma.user.findFirst({
      where: {
        userId: senderId,
        schoolId,
      },
      select: {
        userId: true,
        fullName: true,
        role: true,
      },
    });

    const receiver = await prisma.user.findFirst({
      where: {
        userId: receiverId,
        schoolId,
      },
      select: {
        userId: true,
        fullName: true,
        role: true,
      },
    });

    if (!sender) {
      throw new Error('Sender not found in this school');
    }

    if (!receiver) {
      throw new Error('Receiver not found in this school');
    }

    // Cannot send message to yourself
    if (senderId === receiverId) {
      throw new Error('Cannot send message to yourself');
    }

    const message = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        schoolId,
        content,
      },
      include: {
        sender: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
        receiver: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    return message;
  }

  /**
   * Get conversation between two users
   */
  async getConversation(userId1, userId2, schoolId, limit = 50) {
    // Verify both users belong to the school
    const users = await prisma.user.findMany({
      where: {
        userId: {
          in: [userId1, userId2],
        },
        schoolId,
      },
    });

    if (users.length !== 2) {
      throw new Error('One or both users not found in this school');
    }

    const messages = await prisma.message.findMany({
      where: {
        schoolId,
        OR: [
          {
            senderId: userId1,
            receiverId: userId2,
          },
          {
            senderId: userId2,
            receiverId: userId1,
          },
        ],
      },
      include: {
        sender: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
        receiver: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Math.max(1, Math.min(Number(limit) || 50, 200)),
    });

    return messages.slice().reverse();
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(receiverId, senderId, schoolId) {
    const result = await prisma.message.updateMany({
      where: {
        receiverId,
        senderId,
        schoolId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return result;
  }

  /**
   * Mark single message as read
   */
  async markMessageAsRead(messageId, userId, schoolId) {
    // Verify message belongs to user and school
    const message = await prisma.message.findFirst({
      where: {
        messageId,
        receiverId: userId,
        schoolId,
      },
    });

    if (!message) {
      throw new Error('Message not found or you are not the receiver');
    }

    if (message.isRead) {
      return message; // Already read
    }

    const updated = await prisma.message.update({
      where: {
        messageId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
      include: {
        sender: {
          select: {
            userId: true,
            fullName: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Get recent conversations for a user
   */
  async getRecentConversations(userId, schoolId) {
    const messages = await prisma.message.findMany({
      where: {
        schoolId,
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      include: {
        sender: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
        receiver: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Group by conversation partner
    const conversationsMap = new Map();

    messages.forEach(message => {
      // Determine conversation partner
      const partnerId = message.senderId === userId 
        ? message.receiverId 
        : message.senderId;

      const partner = message.senderId === userId
        ? message.receiver
        : message.sender;

      if (!conversationsMap.has(partnerId)) {
        // Count unread messages from this partner
        const unreadCount = messages.filter(
          m => m.senderId === partnerId && 
               m.receiverId === userId && 
               !m.isRead
        ).length;

        conversationsMap.set(partnerId, {
          partnerId: partner.userId,
          partnerName: partner.fullName,
          partnerRole: partner.role,
          lastMessage: message.content,
          lastMessageTime: message.createdAt,
          unreadCount,
          isLastMessageFromMe: message.senderId === userId,
        });
      }
    });

    // Convert to array and sort by last message time
    const conversations = Array.from(conversationsMap.values()).sort(
      (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
    );

    return conversations;
  }

  /**
   * Get unread message count
   */
  async getUnreadCount(userId, schoolId) {
    const count = await prisma.message.count({
      where: {
        receiverId: userId,
        schoolId,
        isRead: false,
      },
    });

    return count;
  }

  /**
   * Delete message (only sender can delete)
   */
  async deleteMessage(messageId, userId, schoolId) {
    const message = await prisma.message.findFirst({
      where: {
        messageId,
        senderId: userId,
        schoolId,
      },
    });

    if (!message) {
      throw new Error('Message not found or you are not the sender');
    }

    await prisma.message.delete({
      where: {
        messageId,
      },
    });

    return message;
  }

  /**
   * Search messages
   */
  async searchMessages(userId, searchTerm, schoolId) {
    const messages = await prisma.message.findMany({
      where: {
        schoolId,
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
        content: {
          contains: searchTerm,
        },
      },
      include: {
        sender: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
        receiver: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return messages;
  }

  /**
   * People the current user can start a DM with (school-scoped, role-based).
   */
  async getMessagingContacts(userId, schoolId, role) {
    const upper = String(role || '').toUpperCase();

    if (upper === 'SCHOOL_ADMIN') {
      const [teachers, parents] = await Promise.all([
        prisma.teacher.findMany({
          where: { schoolId, isActive: true },
          include: {
            user: {
              select: { userId: true, fullName: true, role: true },
            },
          },
        }),
        prisma.parent.findMany({
          where: { schoolId, isActive: true },
          include: {
            user: {
              select: { userId: true, fullName: true, role: true },
            },
          },
        }),
      ]);

      const map = new Map();
      teachers.forEach((t) => {
        if (t.user?.userId && t.user.userId !== userId) {
          map.set(t.user.userId, {
            userId: t.user.userId,
            fullName: t.user.fullName,
            role: t.user.role,
            kind: 'teacher',
          });
        }
      });
      parents.forEach((p) => {
        if (p.user?.userId && p.user.userId !== userId) {
          map.set(p.user.userId, {
            userId: p.user.userId,
            fullName: p.user.fullName,
            role: p.user.role,
            kind: 'parent',
          });
        }
      });
      return Array.from(map.values()).sort((a, b) =>
        a.fullName.localeCompare(b.fullName)
      );
    }

    if (upper === 'PARENT') {
      const parent = await prisma.parent.findFirst({
        where: { userId, schoolId },
        select: { parentId: true },
      });
      if (!parent) return [];

      const links = await prisma.parentStudent.findMany({
        where: { parentId: parent.parentId },
        include: {
          student: {
            select: {
              classId: true,
            },
          },
        },
      });
      const classIds = [...new Set(links.map((l) => l.student.classId).filter(Boolean))];
      if (classIds.length === 0) return [];

      const classes = await prisma.class.findMany({
        where: { classId: { in: classIds }, schoolId },
        include: {
          homeroomTeacher: {
            include: {
              user: {
                select: { userId: true, fullName: true, role: true },
              },
            },
          },
          classTeachers: {
            include: {
              teacher: {
                include: {
                  user: {
                    select: { userId: true, fullName: true, role: true },
                  },
                },
              },
            },
          },
        },
      });

      const map = new Map();
      classes.forEach((cls) => {
        if (cls.homeroomTeacher?.user?.userId) {
          const u = cls.homeroomTeacher.user;
          if (u.userId !== userId) {
            map.set(u.userId, {
              userId: u.userId,
              fullName: u.fullName,
              role: u.role,
              kind: 'homeroom',
              label: `${u.fullName} · ${cls.className} (homeroom)`,
            });
          }
        }
        cls.classTeachers.forEach((ct) => {
          const u = ct.teacher?.user;
          if (u?.userId && u.userId !== userId) {
            const label = ct.subjectName
              ? `${u.fullName} · ${cls.className} (${ct.subjectName})`
              : `${u.fullName} · ${cls.className}`;
            map.set(u.userId, {
              userId: u.userId,
              fullName: u.fullName,
              role: u.role,
              kind: 'teacher',
              label,
            });
          }
        });
      });
      return Array.from(map.values()).sort((a, b) =>
        (a.label || a.fullName).localeCompare(b.label || b.fullName)
      );
    }

    if (upper === 'TEACHER' || upper === 'HOMEROOM_TEACHER') {
      const teacher = await prisma.teacher.findFirst({
        where: { userId, schoolId },
        select: { teacherId: true },
      });
      if (!teacher) return [];

      const [ctRows, hrClasses] = await Promise.all([
        prisma.classTeacher.findMany({
          where: { teacherId: teacher.teacherId },
          select: { classId: true },
        }),
        prisma.class.findMany({
          where: { schoolId, homeroomTeacherId: teacher.teacherId },
          select: { classId: true },
        }),
      ]);

      const classIds = [
        ...new Set([
          ...ctRows.map((r) => r.classId),
          ...hrClasses.map((c) => c.classId),
        ]),
      ];
      if (classIds.length === 0) return [];

      const students = await prisma.student.findMany({
        where: { classId: { in: classIds }, schoolId, isActive: true },
        select: { studentId: true },
      });
      const studentIds = students.map((s) => s.studentId);
      if (studentIds.length === 0) return [];

      const links = await prisma.parentStudent.findMany({
        where: { studentId: { in: studentIds } },
        include: {
          parent: {
            include: {
              user: {
                select: { userId: true, fullName: true, role: true },
              },
            },
          },
          student: {
            include: {
              user: { select: { fullName: true } },
            },
          },
        },
      });

      const map = new Map();
      links.forEach((link) => {
        const u = link.parent?.user;
        if (!u?.userId || u.userId === userId) return;
        const childName = link.student?.user?.fullName || 'Student';
        map.set(u.userId, {
          userId: u.userId,
          fullName: u.fullName,
          role: u.role,
          kind: 'parent',
          label: `${u.fullName} · parent of ${childName}`,
        });
      });
      return Array.from(map.values()).sort((a, b) =>
        (a.label || a.fullName).localeCompare(b.label || b.fullName)
      );
    }

    return [];
  }
}

module.exports = new MessageService();
