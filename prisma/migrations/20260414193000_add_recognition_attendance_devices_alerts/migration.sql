DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceMethod') THEN
    CREATE TYPE "AttendanceMethod" AS ENUM ('WEBCAM', 'ESP32_CAM');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeviceType') THEN
    CREATE TYPE "DeviceType" AS ENUM ('WEBCAM', 'ESP32_CAM');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AlertType') THEN
    CREATE TYPE "AlertType" AS ENUM ('WRONG_CLASS', 'UNAUTHORIZED_TEACHER', 'UNKNOWN_PERSON');
  END IF;
END $$;

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "timetableId" INTEGER,
  ADD COLUMN IF NOT EXISTS "method" "AttendanceMethod",
  ADD COLUMN IF NOT EXISTS "similarityScore" DOUBLE PRECISION;

ALTER TABLE "teacher_attendance"
  ADD COLUMN IF NOT EXISTS "classId" INTEGER,
  ADD COLUMN IF NOT EXISTS "timetableId" INTEGER,
  ADD COLUMN IF NOT EXISTS "method" "AttendanceMethod",
  ADD COLUMN IF NOT EXISTS "similarityScore" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "devices" (
  "devicePk" SERIAL PRIMARY KEY,
  "deviceId" VARCHAR(100) NOT NULL UNIQUE,
  "deviceType" "DeviceType" NOT NULL,
  "classId" INTEGER NOT NULL,
  "schoolId" INTEGER NOT NULL,
  "location" VARCHAR(200),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "alerts" (
  "alertId" SERIAL PRIMARY KEY,
  "schoolId" INTEGER NOT NULL,
  "userId" VARCHAR(50),
  "classId" INTEGER,
  "type" "AlertType" NOT NULL,
  "message" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "attendance_timetableId_idx" ON "attendance"("timetableId");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_studentId_timetableId_key" ON "attendance"("studentId", "timetableId");

CREATE INDEX IF NOT EXISTS "teacher_attendance_classId_idx" ON "teacher_attendance"("classId");
CREATE INDEX IF NOT EXISTS "teacher_attendance_timetableId_idx" ON "teacher_attendance"("timetableId");
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_attendance_teacherId_timetableId_key" ON "teacher_attendance"("teacherId", "timetableId");

CREATE INDEX IF NOT EXISTS "devices_schoolId_idx" ON "devices"("schoolId");
CREATE INDEX IF NOT EXISTS "devices_classId_idx" ON "devices"("classId");
CREATE INDEX IF NOT EXISTS "devices_isActive_idx" ON "devices"("isActive");

CREATE INDEX IF NOT EXISTS "alerts_schoolId_idx" ON "alerts"("schoolId");
CREATE INDEX IF NOT EXISTS "alerts_userId_idx" ON "alerts"("userId");
CREATE INDEX IF NOT EXISTS "alerts_classId_idx" ON "alerts"("classId");
CREATE INDEX IF NOT EXISTS "alerts_type_idx" ON "alerts"("type");
CREATE INDEX IF NOT EXISTS "alerts_resolved_idx" ON "alerts"("resolved");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'attendance_timetableId_fkey'
  ) THEN
    ALTER TABLE "attendance"
      ADD CONSTRAINT "attendance_timetableId_fkey"
      FOREIGN KEY ("timetableId") REFERENCES "timetable"("timetableId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'teacher_attendance_classId_fkey'
  ) THEN
    ALTER TABLE "teacher_attendance"
      ADD CONSTRAINT "teacher_attendance_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "classes"("classId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'teacher_attendance_timetableId_fkey'
  ) THEN
    ALTER TABLE "teacher_attendance"
      ADD CONSTRAINT "teacher_attendance_timetableId_fkey"
      FOREIGN KEY ("timetableId") REFERENCES "timetable"("timetableId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'devices_classId_fkey'
  ) THEN
    ALTER TABLE "devices"
      ADD CONSTRAINT "devices_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "classes"("classId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'devices_schoolId_fkey'
  ) THEN
    ALTER TABLE "devices"
      ADD CONSTRAINT "devices_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "schools"("schoolId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_schoolId_fkey'
  ) THEN
    ALTER TABLE "alerts"
      ADD CONSTRAINT "alerts_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "schools"("schoolId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_userId_fkey'
  ) THEN
    ALTER TABLE "alerts"
      ADD CONSTRAINT "alerts_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("userId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_classId_fkey'
  ) THEN
    ALTER TABLE "alerts"
      ADD CONSTRAINT "alerts_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "classes"("classId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
