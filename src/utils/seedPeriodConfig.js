// src/utils/seedPeriodConfig.js

function validateSeedInputs(prisma, schoolId, academicYear) {
  if (!prisma) {
    throw new Error('seedPeriodConfigurations: prisma client is required');
  }

  if (!Number.isInteger(Number(schoolId)) || Number(schoolId) <= 0) {
    throw new Error('seedPeriodConfigurations: valid schoolId is required');
  }

  if (!academicYear || typeof academicYear !== 'string') {
    throw new Error('seedPeriodConfigurations: valid academicYear is required');
  }
}

async function seedPeriodConfigurations(prisma, schoolId, academicYear) {
  validateSeedInputs(prisma, schoolId, academicYear);

  const normalizedSchoolId = Number(schoolId);
  const periods = [
    { periodNumber: 1, periodName: 'P1', startTime: '08:00', endTime: '08:55' },
    { periodNumber: 2, periodName: 'P2', startTime: '08:55', endTime: '09:50' },
    { periodNumber: 3, periodName: 'P3', startTime: '09:50', endTime: '10:25' },
    { periodNumber: 4, periodName: 'P4', startTime: '10:55', endTime: '11:50' },
    { periodNumber: 5, periodName: 'P5', startTime: '11:50', endTime: '12:30' },
    { periodNumber: 6, periodName: 'P6', startTime: '13:00', endTime: '14:15' },
    { periodNumber: 7, periodName: 'P7', startTime: '14:15', endTime: '15:05' },
  ];

  for (const period of periods) {
    await prisma.periodConfiguration.upsert({
      where: {
        schoolId_periodNumber_academicYear: {
          schoolId: normalizedSchoolId,
          periodNumber: period.periodNumber,
          academicYear,
        },
      },
      update: period,
      create: {
        schoolId: normalizedSchoolId,
        ...period,
        academicYear,
      },
    });
  }

  const breaks = [
    { breakName: 'Break', afterPeriod: 3, startTime: '10:25', endTime: '10:55' },
    { breakName: 'Lunch', afterPeriod: 5, startTime: '12:30', endTime: '13:00' },
  ];

  for (const breakItem of breaks) {
    await prisma.breakConfiguration.upsert({
      where: {
        schoolId_breakName_academicYear: {
          schoolId: normalizedSchoolId,
          breakName: breakItem.breakName,
          academicYear,
        },
      },
      update: breakItem,
      create: {
        schoolId: normalizedSchoolId,
        ...breakItem,
        academicYear,
      },
    });
  }

  console.log(`Period and break configurations seeded for school ${normalizedSchoolId}`);
}

async function ensurePeriodConfigurations(prisma, schoolId, academicYear) {
  validateSeedInputs(prisma, schoolId, academicYear);

  const normalizedSchoolId = Number(schoolId);
  const existingCount = await prisma.periodConfiguration.count({
    where: {
      schoolId: normalizedSchoolId,
      academicYear,
      isActive: true,
    },
  });

  if (existingCount > 0) {
    return false;
  }

  await seedPeriodConfigurations(prisma, normalizedSchoolId, academicYear);
  return true;
}

module.exports = {
  seedPeriodConfigurations,
  ensurePeriodConfigurations,
};
