const prisma = require('../config/database');
const gradeService = require('../services/grade.service');
const { validateTotalWeight } = require('../utils/gradeValidation');

async function getTeacherOr404({ schoolId, teacherUserId }) {
  return prisma.teacher.findFirst({ where: { userId: teacherUserId, schoolId } });
}

async function ensureTeacherTeachesClass({ teacherId, classId, subjectName }) {
  // Allow homeroom teachers to load grade dashboards for their classes.
  // Grade components/marks are still filtered later by teacherId and subjectId.
  const dev = process?.env?.NODE_ENV === "development";
  try {
    const klassRow = await prisma.class.findFirst({
      where: { classId: Number(classId) },
      select: { homeroomTeacherId: true },
    });
    const isHomeroom = klassRow?.homeroomTeacherId != null && Number(klassRow.homeroomTeacherId) === Number(teacherId);
    if (dev) {
      console.log("[ensureTeacherTeachesClass] homeroom check:", {
        teacherId,
        classId,
        subjectName,
        homeroomTeacherId: klassRow?.homeroomTeacherId ?? null,
        isHomeroom,
      });
    }
    if (isHomeroom) return true;
  } catch (e) {
    // ignore; fall back to class_teachers check below
  }

  const baseWhere = { teacherId, classId };

  // If no subject is provided, only validate teacher <-> class access.
  if (!subjectName) {
    const teaches = await prisma.classTeacher.findFirst({ where: baseWhere });
    return Boolean(teaches);
  }

  const raw = String(subjectName).trim();
  if (!raw) {
    const teaches = await prisma.classTeacher.findFirst({ where: baseWhere });
    return Boolean(teaches);
  }

  // Try subject-specific match case-insensitively first.
  const teachesWithSubject = await prisma.classTeacher.findFirst({
    where: {
      ...baseWhere,
      subjectName: { equals: raw, mode: "insensitive" },
    },
  });
  if (teachesWithSubject) return true;

  // Fallback: if the teacher teaches the class at all, allow grade loading.
  // Components/marks are still filtered by subjectId and teacherId further down.
  const teaches = await prisma.classTeacher.findFirst({ where: baseWhere });
  if (dev) {
    console.log("[ensureTeacherTeachesClass] fallback class_teachers check:", {
      teacherId,
      classId,
      subjectName: raw,
      teachesWithSubject: Boolean(teachesWithSubject),
      teaches: Boolean(teaches),
    });
  }
  return Boolean(teaches);
}

async function resolveSubjectId({ schoolId, subjectName }) {
  if (!subjectName) return null;

  const raw = String(subjectName).trim();
  if (!raw) return null;

  // Allow passing numeric subjectId as string
  const asInt = parseInt(raw, 10);
  if (Number.isInteger(asInt) && String(asInt) === raw) {
    const byId = await prisma.subject.findFirst({
      where: { schoolId, subjectId: asInt, isActive: true },
      select: { subjectId: true },
    });
    return byId?.subjectId ?? null;
  }

  // Try exact matches first (fast path)
  const exact = await prisma.subject.findFirst({
    where: {
      schoolId,
      isActive: true,
      OR: [
        { subjectCode: raw },
        { subjectName: raw },
      ],
    },
    select: { subjectId: true },
  });
  if (exact?.subjectId) return exact.subjectId;

  // Flexible fallback: case-insensitive match by code/name
  const all = await prisma.subject.findMany({
    where: { schoolId, isActive: true },
    select: { subjectId: true, subjectName: true, subjectCode: true },
  });
  const needle = raw.toLowerCase();
  const found =
    all.find((s) => String(s.subjectCode || '').trim().toLowerCase() === needle) ||
    all.find((s) => String(s.subjectName || '').trim().toLowerCase() === needle);

  return found?.subjectId ?? null;
}

function monthKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * GET /api/teacher/classes/:classId/grades
 * Query: ?subjectName=Mathematics
 * Response shape matches TeacherGrades.jsx:
 *  - data.structure: [{ id, component, weight }]
 *  - data.students: [{ id, name, marks: { [componentId]: number } }]
 *  - data.trendData: [{ month, avg }]
 */
const getClassGrades = async (req, res) => {
  try {
    const { classId } = req.params;
    const subjectName = req.query?.subjectName ? String(req.query.subjectName).trim() : null;
    const semester = req.query?.semester ? String(req.query.semester).trim() : null;
    const parsedClassId = parseInt(classId, 10);
    const { schoolId, userId: teacherUserId } = req.user;

    if (!Number.isInteger(parsedClassId)) {
      return res.status(400).json({ success: false, error: 'Invalid classId' });
    }

    console.log("[getClassGrades] request:", { classId: parsedClassId, subjectName, semester, schoolId, teacherUserId });

    const teacher = await getTeacherOr404({ schoolId, teacherUserId });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher record not found' });

    const teaches = await ensureTeacherTeachesClass({ teacherId: teacher.teacherId, classId: parsedClassId, subjectName });
    if (!teaches) return res.status(403).json({ success: false, error: 'You do not teach this class' });

    const klass = await prisma.class.findFirst({
      where: { classId: parsedClassId, schoolId },
      select: { classId: true, academicYear: true },
    });
    if (!klass) return res.status(404).json({ success: false, error: 'Class not found' });

    const semesterRange = gradeService.getSemesterDateRange(klass.academicYear, semester);

    const subjectId = await resolveSubjectId({ schoolId, subjectName });
    if (!subjectId) {
      return res.status(400).json({ success: false, error: 'subjectName is required and must match an existing subject' });
    }

    const components = await prisma.gradeComponent.findMany({
      where: {
        schoolId,
        classId: parsedClassId,
        subjectId,
        teacherId: teacher.teacherId,
        academicYear: klass.academicYear,
        isActive: true,
        ...(semesterRange
          ? {
              createdAt: {
                gte: semesterRange.start,
                lte: semesterRange.end,
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    const structure = components.map((c) => ({
      id: c.componentId,
      component: c.componentName,
      weight: c.weight,
    }));

    const students = await prisma.student.findMany({
      where: { classId: parsedClassId, schoolId, isActive: true },
      include: { user: { select: { fullName: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });

    const componentIds = components.map((c) => c.componentId);
    const marks = componentIds.length
      ? await prisma.studentMark.findMany({
          where: {
            schoolId,
            classId: parsedClassId,
            subjectId,
            academicYear: klass.academicYear,
            componentId: { in: componentIds },
            ...(semesterRange
              ? {
                  createdAt: {
                    gte: semesterRange.start,
                    lte: semesterRange.end,
                  },
                }
              : {}),
          },
          select: { studentId: true, componentId: true, marksObtained: true, createdAt: true },
        })
      : [];

    // marks map per student
    const marksByStudent = new Map();
    for (const m of marks) {
      const current = marksByStudent.get(m.studentId) || {};
      current[m.componentId] = m.marksObtained;
      marksByStudent.set(m.studentId, current);
    }

    // trendData: last 6 months average total (sum of marksObtained per student per month)
    const monthTotalsByStudent = new Map(); // key: month -> Map(studentId -> total)
    for (const m of marks) {
      const mk = monthKey(m.createdAt);
      if (!mk) continue;
      if (!monthTotalsByStudent.has(mk)) monthTotalsByStudent.set(mk, new Map());
      const perStudent = monthTotalsByStudent.get(mk);
      const prev = perStudent.get(m.studentId) || 0;
      perStudent.set(m.studentId, prev + Number(m.marksObtained || 0));
    }
    const months = Array.from(monthTotalsByStudent.keys()).sort().slice(-6);
    const trendData = months.map((m) => {
      const perStudent = monthTotalsByStudent.get(m);
      const values = Array.from(perStudent.values());
      const avg = values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : 0;
      return { month: m, avg };
    });

    const studentsOut = students.map((s) => ({
      id: s.studentId,
      name: s.user?.fullName || `Student #${s.studentId}`,
      marks: marksByStudent.get(s.studentId) || {},
    }));

    console.log("[getClassGrades] response:", {
      structureCount: structure.length,
      studentsCount: studentsOut.length,
      trendCount: trendData.length,
    });

    return res.status(200).json({
      success: true,
      data: {
        classId: parsedClassId,
        subjectName,
        academicYear: klass.academicYear,
        semester: gradeService.normalizeSemester(semester),
        structure,
        students: studentsOut,
        trendData,
      },
    });
  } catch (error) {
    console.error('Get class grades (teacher) error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch grades' });
  }
};

/**
 * POST /api/teacher/classes/:classId/grades
 * Body:
 * {
 *   subjectName: "Mathematics",
 *   structure: [{ id, component, weight }],
 *   students: [{ id, marks: { [componentId]: number } }]
 * }
 */
const addClassGrades = async (req, res) => {
  try {
    const { classId } = req.params;
    const parsedClassId = parseInt(classId, 10);
    const { schoolId, userId: teacherUserId } = req.user;
    const subjectName = req.body?.subjectName ? String(req.body.subjectName).trim() : null;

    if (!Number.isInteger(parsedClassId)) {
      return res.status(400).json({ success: false, error: 'Invalid classId' });
    }
    if (!subjectName) {
      return res.status(400).json({ success: false, error: 'subjectName is required' });
    }

    const teacher = await getTeacherOr404({ schoolId, teacherUserId });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher record not found' });

    const teaches = await ensureTeacherTeachesClass({ teacherId: teacher.teacherId, classId: parsedClassId, subjectName });
    if (!teaches) return res.status(403).json({ success: false, error: 'You do not teach this class' });

    const klass = await prisma.class.findFirst({
      where: { classId: parsedClassId, schoolId },
      select: { classId: true, academicYear: true },
    });
    if (!klass) return res.status(404).json({ success: false, error: 'Class not found' });

    const subjectId = await resolveSubjectId({ schoolId, subjectName });
    if (!subjectId) {
      return res.status(400).json({ success: false, error: 'subjectName must match an existing subject' });
    }

    const incomingStructure = Array.isArray(req.body?.structure) ? req.body.structure : [];
    const incomingStudents = Array.isArray(req.body?.students) ? req.body.students : [];

    if (incomingStructure.length === 0) {
      return res.status(400).json({ success: false, error: 'structure cannot be empty' });
    }

    // Validate weights
    const totalWeight = incomingStructure.reduce((sum, c) => sum + Number(c?.weight || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      return res.status(400).json({ success: false, error: `Total weight must equal 100 (current: ${totalWeight})` });
    }

    // Existing components for weight validation helper
    const existing = await prisma.gradeComponent.findMany({
      where: {
        schoolId,
        classId: parsedClassId,
        subjectId,
        teacherId: teacher.teacherId,
        academicYear: klass.academicYear,
      },
      select: { componentId: true, weight: true, componentName: true, isActive: true },
    });

    // Build desired component set (soft-delete removed, upsert present)
    const desiredById = new Map();
    const desiredNew = [];
    for (const c of incomingStructure) {
      const id = Number(c?.id);
      const componentName = String(c?.component || '').trim();
      const weight = Number(c?.weight);
      if (!componentName) {
        return res.status(400).json({ success: false, error: 'Each structure item must have component name' });
      }
      if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
        return res.status(400).json({ success: false, error: `Invalid weight for component ${componentName}` });
      }
      if (Number.isInteger(id) && id > 0) {
        desiredById.set(id, { componentId: id, componentName, weight });
      } else {
        desiredNew.push({ componentName, weight });
      }
    }

    const existingIds = new Set(existing.map((e) => e.componentId));
    const desiredIds = new Set(desiredById.keys());

    // Transaction: upsert components + soft delete removed + upsert marks
    const result = await prisma.$transaction(async (tx) => {
      // Update existing components
      for (const c of desiredById.values()) {
        if (!existingIds.has(c.componentId)) {
          // Prevent cross-class injection
          return Promise.reject(new Error('Invalid component id in structure'));
        }
        await tx.gradeComponent.update({
          where: { componentId: c.componentId },
          data: {
            componentName: c.componentName,
            weight: c.weight,
            isActive: true,
          },
        });
      }

      // Create new components
      const created = [];
      for (const c of desiredNew) {
        const comp = await tx.gradeComponent.create({
          data: {
            schoolId,
            classId: parsedClassId,
            subjectId,
            teacherId: teacher.teacherId,
            componentName: c.componentName,
            componentType: 'CUSTOM',
            weight: c.weight,
            academicYear: klass.academicYear,
            isActive: true,
          },
          select: { componentId: true, componentName: true, weight: true },
        });
        created.push(comp);
      }

      // Soft delete removed components (only those in this class/subject/teacher/year)
      const toDeactivate = existing
        .filter((e) => e.isActive)
        .map((e) => e.componentId)
        .filter((id) => !desiredIds.has(id));
      if (toDeactivate.length) {
        await tx.gradeComponent.updateMany({
          where: { componentId: { in: toDeactivate } },
          data: { isActive: false },
        });
      }

      // Re-load active components for mapping names/weights
      const activeComponents = await tx.gradeComponent.findMany({
        where: {
          schoolId,
          classId: parsedClassId,
          subjectId,
          teacherId: teacher.teacherId,
          academicYear: klass.academicYear,
          isActive: true,
        },
        select: { componentId: true, weight: true },
      });
      const weightByComponentId = new Map(activeComponents.map((c) => [c.componentId, c.weight]));

      // Validate students belong to class + schoolId
      const studentIds = Array.from(new Set(incomingStudents.map((s) => Number(s?.id)).filter((n) => Number.isInteger(n))));
      const dbStudents = await tx.student.findMany({
        where: { studentId: { in: studentIds }, classId: parsedClassId, schoolId, isActive: true },
        select: { studentId: true },
      });
      if (dbStudents.length !== studentIds.length) {
        return Promise.reject(new Error('One or more students are not in this class (or not in your school)'));
      }

      // Upsert marks using existing service logic (includes recalculation)
      let marksUpserted = 0;
      for (const s of incomingStudents) {
        const sid = Number(s?.id);
        if (!Number.isInteger(sid)) continue;
        const marksMap = s?.marks && typeof s.marks === 'object' ? s.marks : {};
        for (const [compIdRaw, markValRaw] of Object.entries(marksMap)) {
          const compId = Number(compIdRaw);
          const marksObtained = Number(markValRaw);
          if (!Number.isInteger(compId) || !Number.isFinite(marksObtained)) continue;
          const max = weightByComponentId.get(compId);
          if (max === undefined) continue;
          if (marksObtained < 0 || marksObtained > max) {
            return Promise.reject(new Error(`Marks cannot exceed component weight (${max})`));
          }
          // Use gradeService (not tx-bound) for recalculation; keep inside transaction best-effort by using tx for the mark.
          // We do tx upsert + then call gradeService to recalc outside tx.
          await tx.studentMark.upsert({
            where: { studentId_componentId: { studentId: sid, componentId: compId } },
            update: { marksObtained },
            create: {
              studentId: sid,
              componentId: compId,
              schoolId,
              classId: parsedClassId,
              subjectId,
              marksObtained,
              percentage: 0,
              academicYear: klass.academicYear,
            },
          });
          marksUpserted += 1;
        }
      }

      return { createdComponents: created.length, deactivatedComponents: toDeactivate.length, marksUpserted };
    });

    // Recalculate totals/rankings safely after transaction using service (uses schoolId isolation + validations)
    for (const s of incomingStudents) {
      const sid = Number(s?.id);
      if (!Number.isInteger(sid)) continue;
      const marksMap = s?.marks && typeof s.marks === 'object' ? s.marks : {};
      for (const [compIdRaw, markValRaw] of Object.entries(marksMap)) {
        const compId = Number(compIdRaw);
        const marksObtained = Number(markValRaw);
        if (!Number.isInteger(compId) || !Number.isFinite(marksObtained)) continue;
        await gradeService.enterStudentMark({ studentId: sid, componentId: compId, marksObtained }, schoolId);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Grades saved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Save class grades (teacher) error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to save grades' });
  }
};

module.exports = {
  getClassGrades,
  addClassGrades,
};
