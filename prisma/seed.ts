// ============================================================
// Wamanafo SHS — Database Seed Script
// Creates: 1 school, 1 academic year, 3 terms, 1 admin,
// 2 teachers, 4 students, 1 parent, 2 programmes,
// core + elective subjects, 1 class, enrollments.
// ============================================================

import { UserRole, StudentStatus } from "../src/lib/enums";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const SALT_ROUNDS = 12;

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  console.log("🌱 Starting seed...\n");

  // ──────────────────────────────────────────────────────────
  // 1. SCHOOL
  // ──────────────────────────────────────────────────────────
  const school = await db.school.upsert({
    where: { id: "school-accra-academy" },
    update: {},
    create: {
      id:           "school-accra-academy",
      name:         "Wamanafo Senior High Technical School",
      motto:        "Ora et Labora",
      address:      "P.O. Box 1432, Accra, Ghana",
      contactPhone: "+233302226001",
      contactEmail: "info@wamanafo-shs.edu.gh",
    },
  });
  console.log(`✅ School: ${school.name}`);

  // ──────────────────────────────────────────────────────────
  // 2. ACADEMIC YEAR
  // ──────────────────────────────────────────────────────────
  const year = await db.academicYear.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "2024/2025" } },
    update: { isCurrent: true },
    create: {
      schoolId:  school.id,
      name:      "2024/2025",
      startDate: new Date("2024-09-02"),
      endDate:   new Date("2025-07-31"),
      isCurrent: true,
    },
  });
  console.log(`✅ Academic Year: ${year.name}`);

  // ──────────────────────────────────────────────────────────
  // 3. TERMS (weights: 30% class, 70% exam — GES default)
  // ──────────────────────────────────────────────────────────
  const term1 = await db.term.upsert({
    where: { yearId_number: { yearId: year.id, number: 1 } },
    update: {},
    create: {
      yearId:           year.id,
      name:             "First Term",
      number:           1,
      totalSchoolDays:  75,
      classScoreWeight: 30,
      examScoreWeight:  70,
      startDate:        new Date("2024-09-02"),
      endDate:          new Date("2024-12-13"),
      isCurrent:        false,
    },
  });

  const term2 = await db.term.upsert({
    where: { yearId_number: { yearId: year.id, number: 2 } },
    update: {},
    create: {
      yearId:           year.id,
      name:             "Second Term",
      number:           2,
      totalSchoolDays:  70,
      classScoreWeight: 30,
      examScoreWeight:  70,
      startDate:        new Date("2025-01-06"),
      endDate:          new Date("2025-04-11"),
      isCurrent:        true,
    },
  });

  const term3 = await db.term.upsert({
    where: { yearId_number: { yearId: year.id, number: 3 } },
    update: {},
    create: {
      yearId:           year.id,
      name:             "Third Term",
      number:           3,
      totalSchoolDays:  65,
      classScoreWeight: 30,
      examScoreWeight:  70,
      startDate:        new Date("2025-04-28"),
      endDate:          new Date("2025-07-25"),
      isCurrent:        false,
    },
  });
  console.log(`✅ Terms: ${term1.name}, ${term2.name}, ${term3.name}`);

  // ──────────────────────────────────────────────────────────
  // 4. PROGRAMMES
  // ──────────────────────────────────────────────────────────
  const scienceProg = await db.programme.upsert({
    where: { schoolId_code: { schoolId: school.id, code: "GS" } },
    update: {},
    create: { schoolId: school.id, name: "General Science",  code: "GS" },
  });

  const artsProg = await db.programme.upsert({
    where: { schoolId_code: { schoolId: school.id, code: "GA" } },
    update: {},
    create: { schoolId: school.id, name: "General Arts",     code: "GA" },
  });
  console.log(`✅ Programmes: ${scienceProg.name}, ${artsProg.name}`);

  // ──────────────────────────────────────────────────────────
  // 5. SUBJECTS — Core (4) + Electives per programme
  // ──────────────────────────────────────────────────────────
  const subjectData = [
    // Core subjects (GES mandated)
    { name: "English Language",   code: "ENG",  isCore: true  },
    { name: "Mathematics",         code: "MATH", isCore: true  },
    { name: "Integrated Science",  code: "ISCI", isCore: true  },
    { name: "Social Studies",      code: "SOST", isCore: true  },
    // Science electives
    { name: "Elective Mathematics",code: "EMAT", isCore: false },
    { name: "Physics",             code: "PHY",  isCore: false },
    { name: "Chemistry",           code: "CHEM", isCore: false },
    { name: "Biology",             code: "BIO",  isCore: false },
    // Arts electives
    { name: "Literature in English", code: "LIT", isCore: false },
    { name: "Government",          code: "GOV",  isCore: false },
    { name: "Economics",           code: "ECO",  isCore: false },
    { name: "French",              code: "FRN",  isCore: false },
  ];

  const subjects: Record<string, { id: string; isCore: boolean }> = {};

  for (const s of subjectData) {
    const subject = await db.subject.upsert({
      where: { schoolId_code: { schoolId: school.id, code: s.code } },
      update: {},
      create: { schoolId: school.id, ...s },
    });
    subjects[s.code] = { id: subject.id, isCore: subject.isCore };
  }
  console.log(`✅ Subjects: ${subjectData.length} created`);

  // ──────────────────────────────────────────────────────────
  // 6. PROGRAMME SUBJECTS
  // ──────────────────────────────────────────────────────────

  // All programmes include core subjects
  const coreIds = ["ENG", "MATH", "ISCI", "SOST"].map((c) => subjects[c]!.id);
  const scienceElectiveIds = ["EMAT", "PHY", "CHEM", "BIO"].map((c) => subjects[c]!.id);
  const artsElectiveIds    = ["LIT", "GOV", "ECO", "FRN"].map((c) => subjects[c]!.id);

  const scienceSubjectIds  = [...coreIds, ...scienceElectiveIds];
  const artsSubjectIds     = [...coreIds, ...artsElectiveIds];

  for (const subjectId of scienceSubjectIds) {
    await db.programmeSubject.upsert({
      where: { programmeId_subjectId: { programmeId: scienceProg.id, subjectId } },
      update: {},
      create: { programmeId: scienceProg.id, subjectId },
    });
  }

  for (const subjectId of artsSubjectIds) {
    await db.programmeSubject.upsert({
      where: { programmeId_subjectId: { programmeId: artsProg.id, subjectId } },
      update: {},
      create: { programmeId: artsProg.id, subjectId },
    });
  }
  console.log(`✅ Programme subjects linked`);

  // ──────────────────────────────────────────────────────────
  // 7. USERS — Admin
  // ──────────────────────────────────────────────────────────
  const adminUser = await db.user.upsert({
    where: { email: "admin@wamanafo-shs.edu.gh" },
    update: {},
    create: {
      email:        "admin@wamanafo-shs.edu.gh",
      passwordHash: await hash("Admin@12345"),
      role:         UserRole.ADMIN,
      schoolId:     school.id,
      firstName:    "Kwame",
      lastName:     "Mensah",
      isActive:     true,
    },
  });
  console.log(`✅ Admin: ${adminUser.email} (password: Admin@12345)`);

  // ──────────────────────────────────────────────────────────
  // 8. TEACHER USERS
  // ──────────────────────────────────────────────────────────
  const teacher1User = await db.user.upsert({
    where: { email: "k.asante@wamanafo-shs.edu.gh" },
    update: {},
    create: {
      email:        "k.asante@wamanafo-shs.edu.gh",
      passwordHash: await hash("Teacher@12345"),
      role:         UserRole.TEACHER,
      schoolId:     school.id,
      firstName:    "Kofi",
      lastName:     "Asante",
      isActive:     true,
    },
  });

  const teacher2User = await db.user.upsert({
    where: { email: "a.boateng@wamanafo-shs.edu.gh" },
    update: {},
    create: {
      email:        "a.boateng@wamanafo-shs.edu.gh",
      passwordHash: await hash("Teacher@12345"),
      role:         UserRole.TEACHER,
      schoolId:     school.id,
      firstName:    "Abena",
      lastName:     "Boateng",
      isActive:     true,
    },
  });

  const teacher1 = await db.teacher.upsert({
    where: { userId: teacher1User.id },
    update: {},
    create: { schoolId: school.id, userId: teacher1User.id, staffId: "TCH-2024-001" },
  });

  const teacher2 = await db.teacher.upsert({
    where: { userId: teacher2User.id },
    update: {},
    create: { schoolId: school.id, userId: teacher2User.id, staffId: "TCH-2024-002" },
  });
  console.log(`✅ Teachers: ${teacher1User.email}, ${teacher2User.email}`);

  // ──────────────────────────────────────────────────────────
  // 9. CLASS — SHS 1A (General Science, teacher1 as form master)
  // ──────────────────────────────────────────────────────────
  const class1A = await db.class.upsert({
    where: { schoolId_name_yearId: { schoolId: school.id, name: "SHS 1A", yearId: year.id } },
    update: { formMasterId: teacher1.id },
    create: {
      schoolId:     school.id,
      name:         "SHS 1A",
      yearId:       year.id,
      programmeId:  scienceProg.id,
      formMasterId: teacher1.id,
    },
  });
  console.log(`✅ Class: ${class1A.name}`);

  // ──────────────────────────────────────────────────────────
  // 10. TEACHING ASSIGNMENTS
  // ──────────────────────────────────────────────────────────
  const mathSubjectId   = subjects["MATH"]!.id;
  const physicsSubjectId = subjects["PHY"]!.id;
  const engSubjectId    = subjects["ENG"]!.id;
  const chemSubjectId   = subjects["CHEM"]!.id;

  // Assign teacher1 → Math + Physics, teacher2 → English + Chemistry for term2
  const teachingAssignments = [
    { teacherId: teacher1.id, subjectId: mathSubjectId,    termId: term2.id },
    { teacherId: teacher1.id, subjectId: physicsSubjectId, termId: term2.id },
    { teacherId: teacher2.id, subjectId: engSubjectId,     termId: term2.id },
    { teacherId: teacher2.id, subjectId: chemSubjectId,    termId: term2.id },
  ];

  for (const ta of teachingAssignments) {
    await db.teachingAssignment.upsert({
      where: {
        teacherId_subjectId_classId_termId: {
          teacherId: ta.teacherId,
          subjectId: ta.subjectId,
          classId:   class1A.id,
          termId:    ta.termId,
        },
      },
      update: {},
      create: { ...ta, classId: class1A.id },
    });
  }
  console.log(`✅ Teaching assignments: ${teachingAssignments.length}`);

  // ──────────────────────────────────────────────────────────
  // 11. STUDENT USERS
  // ──────────────────────────────────────────────────────────
  const studentData = [
    {
      email:       "e.ofori@wamanafo-shs.edu.gh",
      firstName:   "Efua",
      lastName:    "Ofori",
      indexNumber: "0050101001",
      dateOfBirth: new Date("2007-03-15"),
      gender:      "Female",
    },
    {
      email:       "k.darko@wamanafo-shs.edu.gh",
      firstName:   "Kwabena",
      lastName:    "Darko",
      indexNumber: "0050101002",
      dateOfBirth: new Date("2007-06-22"),
      gender:      "Male",
    },
    {
      email:       "a.amponsah@wamanafo-shs.edu.gh",
      firstName:   "Ama",
      lastName:    "Amponsah",
      indexNumber: "0050101003",
      dateOfBirth: new Date("2007-11-08"),
      gender:      "Female",
    },
    {
      email:       "y.osei@wamanafo-shs.edu.gh",
      firstName:   "Yaw",
      lastName:    "Osei",
      indexNumber: "0050101004",
      dateOfBirth: new Date("2006-09-30"),
      gender:      "Male",
    },
  ];

  const studentIds: string[] = [];

  for (const sd of studentData) {
    const sUser = await db.user.upsert({
      where: { email: sd.email },
      update: {},
      create: {
        email:        sd.email,
        passwordHash: await hash("Student@12345"),
        role:         UserRole.STUDENT,
        schoolId:     school.id,
        firstName:    sd.firstName,
        lastName:     sd.lastName,
        isActive:     true,
      },
    });

    const student = await db.student.upsert({
      where: { userId: sUser.id },
      update: {},
      create: {
        schoolId:    school.id,
        indexNumber: sd.indexNumber,
        userId:      sUser.id,
        dateOfBirth: sd.dateOfBirth,
        gender:      sd.gender,
        status:      StudentStatus.ACTIVE,
      },
    });

    // Enroll in SHS 1A
    await db.classEnrollment.upsert({
      where: {
        studentId_classId_yearId: {
          studentId: student.id,
          classId:   class1A.id,
          yearId:    year.id,
        },
      },
      update: {},
      create: {
        studentId: student.id,
        classId:   class1A.id,
        yearId:    year.id,
      },
    });

    studentIds.push(student.id);
  }
  console.log(`✅ Students: ${studentData.length} enrolled in ${class1A.name}`);

  // ──────────────────────────────────────────────────────────
  // 12. PARENT
  // ──────────────────────────────────────────────────────────
  const parentUser = await db.user.upsert({
    where: { email: "parent.ofori@gmail.com" },
    update: {},
    create: {
      email:        "parent.ofori@gmail.com",
      passwordHash: await hash("Parent@12345"),
      role:         UserRole.PARENT,
      schoolId:     school.id,
      firstName:    "Nana",
      lastName:     "Ofori",
      isActive:     true,
    },
  });

  const parent = await db.parent.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: {
      userId:   parentUser.id,
      schoolId: school.id,
      phone:    "+233244556677",
    },
  });

  // Link parent to first student (Efua Ofori)
  await db.parentStudent.upsert({
    where: {
      parentId_studentId: { parentId: parent.id, studentId: studentIds[0]! },
    },
    update: {},
    create: {
      parentId:  parent.id,
      studentId: studentIds[0]!,
      relation:  "Mother",
    },
  });
  console.log(`✅ Parent: ${parentUser.email} linked to Efua Ofori`);

  // ──────────────────────────────────────────────────────────
  // Done
  // ──────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Seed complete!

Test Credentials (password for all roles):
  Admin   : admin@wamanafo-shs.edu.gh   / Admin@12345
  Teacher1: k.asante@wamanafo-shs.edu.gh / Teacher@12345
  Teacher2: a.boateng@wamanafo-shs.edu.gh / Teacher@12345
  Student : e.ofori@wamanafo-shs.edu.gh / Student@12345
  Parent  : parent.ofori@gmail.com      / Parent@12345
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
