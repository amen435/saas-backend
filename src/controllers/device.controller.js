const prisma = require('../config/database');

const listDevices = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const devices = await prisma.device.findMany({
      where: {
        schoolId,
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
      orderBy: [
        { createdAt: 'desc' },
        { devicePk: 'desc' },
      ],
    });

    return res.status(200).json({
      success: true,
      count: devices.length,
      data: devices,
    });
  } catch (error) {
    console.error('List devices error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch devices.',
    });
  }
};

const createDevice = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const payload = req.validatedBody || req.body || {};

    const classRecord = await prisma.class.findFirst({
      where: {
        classId: payload.classId,
        schoolId,
      },
      select: {
        classId: true,
      },
    });

    if (!classRecord) {
      return res.status(404).json({
        success: false,
        error: 'Class not found in your school.',
      });
    }

    const existing = await prisma.device.findUnique({
      where: {
        deviceId: payload.deviceId,
      },
      select: {
        devicePk: true,
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Device ID already exists.',
      });
    }

    const device = await prisma.device.create({
      data: {
        deviceId: payload.deviceId,
        deviceType: payload.deviceType,
        classId: payload.classId,
        schoolId,
        location: payload.location || null,
        isActive: payload.isActive ?? true,
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

    return res.status(201).json({
      success: true,
      message: 'Device created successfully.',
      data: device,
    });
  } catch (error) {
    console.error('Create device error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create device.',
    });
  }
};

module.exports = {
  listDevices,
  createDevice,
};
