const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Temporary test connection
prisma.user.count()
  .then(count => {
    console.log("✅ Database connected. Users count:", count);
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err);
  });

module.exports = prisma;