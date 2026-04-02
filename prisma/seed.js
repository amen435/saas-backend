// prisma/seed.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { seedPeriodConfigurations } = require('../src/utils/seedPeriodConfig');

const prisma = new PrismaClient();

async function main() {
  if ((process.env.NODE_ENV || 'development') === 'production' && process.env.ALLOW_SEED_DEMO_DATA !== 'true') {
    throw new Error('Seeding demo credentials in production is disabled. Set ALLOW_SEED_DEMO_DATA=true only for a deliberate one-time bootstrap.');
  }

  console.log('🌱 Starting database seeding...\n');

  try {
    // ============================================
    // 1. CREATE SUPER ADMIN
    // ============================================
    console.log('👤 Creating Super Admin...');
    
    const superAdminPlaintext = process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe-SuperAdmin!123';
    const superAdminPassword = await bcrypt.hash(superAdminPlaintext, 10);
    
    const superAdmin = await prisma.user.upsert({
      where: { userId: 'SA001' },
      update: {},
      create: {
        userId: 'SA001',
        username: 'superadmin',
        email: 'superadmin@intelligeschool.et',
        passwordHash: superAdminPassword,
        role: 'SUPER_ADMIN',
        schoolId: null,
        fullName: 'Super Administrator',
        phone: '+251911000000',
        isActive: true,
      },
    });

    console.log('✅ Super Admin created\n');

    // ============================================
    // 2. CREATE SCHOOLS
    // ============================================
    console.log('🏫 Creating Schools...\n');
    
    const schools = [
      {
        schoolCode: 'ET-001001',
        schoolName: 'Bole International School',
        address: 'Bole Road, Near Edna Mall',
        city: 'Addis Ababa',
        country: 'Ethiopia',
        expiryDate: new Date('2026-12-31'),
        isActive: true,
      },
      {
        schoolCode: 'ET-002002',
        schoolName: 'Mekele Academy',
        address: 'Mekele City Center',
        city: 'Mekele',
        country: 'Ethiopia',
        expiryDate: new Date('2025-12-31'),
        isActive: false,
      },
      {
        schoolCode: 'ET-003003',
        schoolName: 'Bahir Dar High School',
        address: 'Near Lake Tana',
        city: 'Bahir Dar',
        country: 'Ethiopia',
        expiryDate: new Date('2026-06-30'),
        isActive: true,
      },
      {
        schoolCode: 'ET-004004',
        schoolName: 'Hawassa International',
        address: 'Hawassa University Road',
        city: 'Hawassa',
        country: 'Ethiopia',
        expiryDate: new Date('2025-03-15'),
        isActive: false,
      },
      {
        schoolCode: 'ET-005005',
        schoolName: 'Jimma Preparatory School',
        address: 'Jimma Town Center',
        city: 'Jimma',
        country: 'Ethiopia',
        expiryDate: null,
        isActive: true,
      },
      {
        schoolCode: 'ET-006006',
        schoolName: 'Dire Dawa Academy',
        address: 'Kezira District',
        city: 'Dire Dawa',
        country: 'Ethiopia',
        expiryDate: new Date('2027-12-31'),
        isActive: true,
      },
      {
        schoolCode: 'ET-007007',
        schoolName: 'Gondar Royal School',
        address: 'Near Fasil Ghebbi',
        city: 'Gondar',
        country: 'Ethiopia',
        expiryDate: new Date('2024-12-31'),
        isActive: false,
      },
      {
        schoolCode: 'ET-008008',
        schoolName: 'Adama Science Academy',
        address: 'Adama Industrial Zone',
        city: 'Adama',
        country: 'Ethiopia',
        expiryDate: new Date('2026-09-30'),
        isActive: true,
      },
    ];

    const createdSchools = [];

    for (const schoolData of schools) {
      const school = await prisma.school.upsert({
        where: { schoolCode: schoolData.schoolCode },
        update: {},
        create: schoolData,
      });
      
      createdSchools.push(school);
      
      console.log(`✅ ${school.schoolName} (${school.schoolCode})`);
      console.log(`   City: ${school.city}`);
      console.log(`   Expiry: ${school.expiryDate ? school.expiryDate.toISOString().split('T')[0] : 'No expiry'}`);
      console.log(`   Status: ${school.isActive ? 'Active' : 'Inactive'}\n`);
    }

    // ============================================
    // 3. CREATE SCHOOL ADMINS
    // ============================================
    console.log('👨‍💼 Creating School Admins...\n');
    
    const schoolAdmins = [
      {
        userId: 'boleAD001',
        username: 'admin.bole',
        email: 'admin@bole.et',
        fullName: 'Tadesse Alemayehu',
        phone: '+251911111111',
        schoolCode: 'ET-001001',
      },
      {
        userId: 'mekeleAD001',
        username: 'admin.mekele',
        email: 'admin@mekele.et',
        fullName: 'Tigist Hailu',
        phone: '+251911222222',
        schoolCode: 'ET-002002',
      },
      {
        userId: 'bahirdarAD001',
        username: 'admin.bahirdar',
        email: 'admin@bahirdar.et',
        fullName: 'Abebe Kebede',
        phone: '+251911333333',
        schoolCode: 'ET-003003',
      },
      {
        userId: 'hawassaAD001',
        username: 'admin.hawassa',
        email: 'admin@hawassa.et',
        fullName: 'Meron Tesfaye',
        phone: '+251911444444',
        schoolCode: 'ET-004004',
      },
      {
        userId: 'jimmaAD001',
        username: 'admin.jimma',
        email: 'admin@jimma.et',
        fullName: 'Solomon Girma',
        phone: '+251911555555',
        schoolCode: 'ET-005005',
      },
    ];

    const adminPlaintext = process.env.SEED_SCHOOL_ADMIN_PASSWORD || 'ChangeMe-SchoolAdmin!123';
    const adminPassword = await bcrypt.hash(adminPlaintext, 10);

    for (const adminData of schoolAdmins) {
      const school = createdSchools.find(s => s.schoolCode === adminData.schoolCode);
      
      if (school) {
        const admin = await prisma.user.upsert({
          where: { userId: adminData.userId },
          update: {},
          create: {
            userId: adminData.userId,
            username: adminData.username,
            email: adminData.email,
            passwordHash: adminPassword,
            role: 'SCHOOL_ADMIN',
            schoolId: school.schoolId,
            fullName: adminData.fullName,
            phone: adminData.phone,
            isActive: true,
          },
        });

        console.log(`✅ ${admin.fullName} (${admin.username})`);
        console.log(`   School: ${school.schoolName}\n`);
      }
    }

    // ============================================
    // 4. CREATE HOMEROOM TEACHER
    // ============================================
    console.log('👨‍🏫 Creating Homeroom Teacher...\n');

    const homeroomPlaintext = process.env.SEED_HOMEROOM_PASSWORD || 'ChangeMe-Homeroom!123';
    const homeroomPassword = await bcrypt.hash(homeroomPlaintext, 10);

    const homeroomUser = await prisma.user.upsert({
      where: { userId: 'boleHT001' },
      update: {},
      create: {
        userId: 'boleHT001',
        username: 'homeroom.tigist',
        email: 'homeroom.tigist@bole.et',
        passwordHash: homeroomPassword,
        role: 'HOMEROOM_TEACHER',
        schoolId: createdSchools[0].schoolId,
        fullName: 'Tigist Hailu',
        phone: '+251922111111',
        isActive: true,
      }
    });

    const homeroomTeacher = await prisma.teacher.upsert({
      where: { userId: homeroomUser.userId },
      update: {},
      create: {
        userId: homeroomUser.userId,
        schoolId: createdSchools[0].schoolId,
        specialization: 'Mathematics',
        isActive: true,
      }
    });

    console.log(`✅ ${homeroomUser.fullName} (${homeroomUser.username})`);
    console.log(`   Role: HOMEROOM_TEACHER`);
    console.log(`   Teacher ID: ${homeroomTeacher.teacherId}\n`);

    // ============================================
    // 5. CREATE REGULAR TEACHER
    // ============================================
    console.log('👨‍🏫 Creating Regular Teacher...\n');

    const teacherPlaintext = process.env.SEED_TEACHER_PASSWORD || 'ChangeMe-Teacher!123';
    const teacherPassword = await bcrypt.hash(teacherPlaintext, 10);

    const teacherUser = await prisma.user.upsert({
      where: { userId: 'boleTC001' },
      update: {},
      create: {
        userId: 'boleTC001',
        username: 'teacher.ahmed',
        email: 'ahmed@bole.et',
        passwordHash: teacherPassword,
        role: 'TEACHER',
        schoolId: createdSchools[0].schoolId,
        fullName: 'Ahmed Ibrahim',
        phone: '+251922222222',
        isActive: true,
      }
    });

    const teacher = await prisma.teacher.upsert({
      where: { userId: teacherUser.userId },
      update: {},
      create: {
        userId: teacherUser.userId,
        schoolId: createdSchools[0].schoolId,
        specialization: 'Physics',
        isActive: true,
      }
    });

    console.log(`✅ ${teacherUser.fullName} (${teacherUser.username})`);
    console.log(`   School: ${createdSchools[0].schoolName}`);
    console.log(`   Specialization: ${teacher.specialization}\n`);

    // ============================================
    // 6. CREATE CLASS
    // ============================================
    console.log('🏫 Creating Class...\n');

    const sampleClass = await prisma.class.upsert({
      where: {
        schoolId_gradeLevel_section_academicYear: {
          schoolId: createdSchools[0].schoolId,
          gradeLevel: 8,
          section: 'A',
          academicYear: '2025/2026'
        }
      },
      update: {
        homeroomTeacherId: homeroomTeacher.teacherId,
        capacity: 40
      },
      create: {
        schoolId: createdSchools[0].schoolId,
        className: 'Grade 8-A',
        gradeLevel: 8,
        section: 'A',
        academicYear: '2025/2026',
        homeroomTeacherId: homeroomTeacher.teacherId,
        capacity: 40,
        isActive: true,
      }
    });

    console.log(`✅ ${sampleClass.className}`);
    console.log(`   Homeroom Teacher: ${homeroomUser.fullName}\n`);

    // ============================================
    // 7. CREATE SUBJECTS (NEW!)
    // ============================================
    console.log('📚 Creating Sample Subjects...\n');

    const subjects = [
      {
        subjectCode: 'MATH-8',
        subjectName: 'Mathematics Grade 8',
        description: 'Algebra, Geometry, and Statistics',
      },
      {
        subjectCode: 'ENG-8',
        subjectName: 'English Grade 8',
        description: 'Grammar, Literature, and Composition',
      },
      {
        subjectCode: 'SCI-8',
        subjectName: 'Science Grade 8',
        description: 'Physics, Chemistry, and Biology',
      },
      {
        subjectCode: 'HIST-8',
        subjectName: 'History Grade 8',
        description: 'Ethiopian and World History',
      },
      {
        subjectCode: 'GEO-8',
        subjectName: 'Geography Grade 8',
        description: 'Physical and Human Geography',
      },
    ];

    const createdSubjects = [];

    for (const subjectData of subjects) {
      const subject = await prisma.subject.upsert({
        where: {
          schoolId_subjectCode: {
            schoolId: createdSchools[0].schoolId,
            subjectCode: subjectData.subjectCode
          }
        },
        update: {},
        create: {
          ...subjectData,
          schoolId: createdSchools[0].schoolId,
        }
      });

      createdSubjects.push(subject);
      console.log(`✅ ${subject.subjectName} (${subject.subjectCode})`);
    }

    console.log('');

    // ============================================
    // 8. ASSIGN TEACHERS TO SUBJECTS
    // ============================================
    console.log('👨‍🏫 Assigning Teachers to Subjects...\n');

    // Assign homeroom teacher to Math and Science
    await prisma.subjectTeacher.upsert({
      where: {
        subjectId_teacherId: {
          subjectId: createdSubjects[0].subjectId, // Math
          teacherId: homeroomTeacher.teacherId
        }
      },
      update: {},
      create: {
        subjectId: createdSubjects[0].subjectId,
        teacherId: homeroomTeacher.teacherId
      }
    });

    await prisma.subjectTeacher.upsert({
      where: {
        subjectId_teacherId: {
          subjectId: createdSubjects[2].subjectId, // Science
          teacherId: homeroomTeacher.teacherId
        }
      },
      update: {},
      create: {
        subjectId: createdSubjects[2].subjectId,
        teacherId: homeroomTeacher.teacherId
      }
    });

    console.log(`✅ ${homeroomUser.fullName} assigned to Mathematics & Science`);

    // Assign regular teacher to Physics
    await prisma.subjectTeacher.upsert({
      where: {
        subjectId_teacherId: {
          subjectId: createdSubjects[2].subjectId, // Science
          teacherId: teacher.teacherId
        }
      },
      update: {},
      create: {
        subjectId: createdSubjects[2].subjectId,
        teacherId: teacher.teacherId
      }
    });

    console.log(`✅ ${teacherUser.fullName} assigned to Science\n`);

    // ============================================
    // SUMMARY
    // ============================================
    // ============================================
    // PERIOD / BREAK CONFIGURATIONS
    // ============================================
    console.log('⏰ Seeding period & break configurations...\n');
    await seedPeriodConfigurations(prisma, createdSchools[0].schoolId, '2025/2026');
    console.log('✅ Period & break configurations seeded\n');

    console.log('════════════════════════════════════════');
    console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
    console.log('════════════════════════════════════════\n');
    
    console.log('🔐 Demo accounts were seeded.');
    console.log('Provide explicit SEED_*_PASSWORD values before running this script outside local development.\n');
    
    console.log('📚 SUBJECTS CREATED: ' + createdSubjects.length);
    createdSubjects.forEach((subject, index) => {
      console.log(`    ${index + 1}. ${subject.subjectName} (${subject.subjectCode})`);
    });
    
    console.log('\n════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
