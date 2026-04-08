const { PrismaClient } = require("@prisma/client");
const { seedPeriodConfigurations } = require("./seedPeriodConfig");

async function main() {
  const prisma = new PrismaClient();
  const schoolIdArg = process.argv[2];
  const academicYearArg = process.argv[3];

  const schoolId = Number(schoolIdArg);
  const academicYear = academicYearArg;

  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    console.error("Invalid schoolId. Usage: node src/utils/seedPeriodsManual.js <schoolId> <academicYear>");
    process.exit(1);
  }

  if (!academicYear || typeof academicYear !== "string") {
    console.error("Invalid academicYear. Usage: node src/utils/seedPeriodsManual.js <schoolId> <academicYear>");
    process.exit(1);
  }

  try {
    await seedPeriodConfigurations(prisma, schoolId, academicYear);
    console.log(`Done seeding period config for schoolId=${schoolId}, academicYear=${academicYear}`);
  } catch (error) {
    console.error("Failed to seed period config:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
