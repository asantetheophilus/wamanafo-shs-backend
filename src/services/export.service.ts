// ============================================================
// Wamanafo SHS - Export Service
// Generates Excel/CSV exports for attendance and scores with strict teacher scoping.
// ============================================================

import * as XLSX from "xlsx";
import { db } from "../lib/db";

export type ExportFormat = "xlsx" | "csv";

export interface ExportAttendanceFilter {
  classId?: string;
  termId?: string;
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ExportScoreFilter {
  classId?: string;
  subjectId?: string;
  termId?: string;
  studentId?: string;
}

function buildWorkbook(headers: string[], rows: (string | number | null | undefined)[][]): XLSX.WorkBook {
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  return wb;
}

function toBuffer(wb: XLSX.WorkBook, format: ExportFormat): Buffer {
  return Buffer.from(
    XLSX.write(wb, {
      type: "buffer",
      bookType: format === "csv" ? "csv" : "xlsx",
    })
  );
}

function contentType(format: ExportFormat): string {
  return format === "csv"
    ? "text/csv"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function emptyExport(headers: string[], prefix: string, format: ExportFormat) {
  const wb = buildWorkbook(headers, []);
  return {
    buffer: toBuffer(wb, format),
    filename: `${prefix}_${Date.now()}.${format}`,
    contentType: contentType(format),
  };
}

async function getTeacherAssignments(
  teacherId: string,
  filter: { classId?: string; subjectId?: string; termId?: string }
) {
  return db.teachingAssignment.findMany({
    where: {
      teacherId,
      ...(filter.classId ? { classId: filter.classId } : {}),
      ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      ...(filter.termId ? { termId: filter.termId } : {}),
    },
    select: {
      classId: true,
      subjectId: true,
      termId: true,
      term: { select: { yearId: true, name: true } },
    },
  });
}

export async function exportAttendance(
  schoolId: string,
  teacherId: string | undefined,
  filter: ExportAttendanceFilter,
  format: ExportFormat,
  isAdmin = false
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const headers = ["Index Number", "Student Name", "Class", "Term", "Date", "Status", "Note"];

  let classIds: string[] | undefined;

  if (!isAdmin) {
    if (!teacherId) throw new Error("Teacher scope is required.");

    const assignments = await getTeacherAssignments(teacherId, {
      classId: filter.classId,
      termId: filter.termId,
    });

    classIds = [...new Set(assignments.map((a) => a.classId))];
    if (classIds.length === 0) return emptyExport(headers, "attendance_export", format);

    if (filter.classId && !classIds.includes(filter.classId)) {
      throw new Error("You are not authorized to export attendance for this class.");
    }
  } else if (teacherId) {
    const assignments = await getTeacherAssignments(teacherId, {
      classId: filter.classId,
      termId: filter.termId,
    });
    classIds = [...new Set(assignments.map((a) => a.classId))];
    if (classIds.length === 0) return emptyExport(headers, "attendance_export", format);
  }

  const records = await db.attendanceRecord.findMany({
    where: {
      student: { schoolId },
      ...(classIds ? { classId: { in: classIds } } : filter.classId ? { classId: filter.classId } : {}),
      ...(filter.termId ? { termId: filter.termId } : {}),
      ...(filter.studentId ? { studentId: filter.studentId } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            date: {
              ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
              ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
            },
          }
        : {}),
    },
    include: {
      student: { include: { user: { select: { firstName: true, lastName: true } } } },
      class: { select: { name: true } },
      term: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { student: { indexNumber: "asc" } }],
  });

  const rows = records.map((r) => [
    r.student.indexNumber,
    `${r.student.user.firstName} ${r.student.user.lastName}`,
    r.class.name,
    r.term.name,
    r.date.toISOString().split("T")[0],
    r.status,
    r.note ?? "",
  ]);

  const wb = buildWorkbook(headers, rows);
  return {
    buffer: toBuffer(wb, format),
    filename: `attendance_export_${Date.now()}.${format}`,
    contentType: contentType(format),
  };
}

export async function exportScores(
  schoolId: string,
  teacherId: string | undefined,
  filter: ExportScoreFilter,
  format: ExportFormat,
  isAdmin = false
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const headers = [
    "Index Number",
    "Student Name",
    "Class",
    "Subject",
    "Term",
    "Class Score",
    "Exam Score",
    "Total",
    "Grade",
    "Remark",
  ];

  type AssignmentRow = {
    classId: string;
    subjectId: string;
    termId: string;
    term: { yearId: string; name: string };
  };

  let assignments: AssignmentRow[] = [];

  if (!isAdmin || teacherId) {
    if (!teacherId) throw new Error("Teacher scope is required.");
    assignments = (await getTeacherAssignments(teacherId, {
      classId: filter.classId,
      subjectId: filter.subjectId,
      termId: filter.termId,
    })) as AssignmentRow[];

    if (assignments.length === 0) return emptyExport(headers, "scores_export", format);
  }

  const subjectIds = assignments.length ? [...new Set(assignments.map((a) => a.subjectId))] : undefined;
  const termIds = assignments.length ? [...new Set(assignments.map((a) => a.termId))] : undefined;

  const scores = await db.score.findMany({
    where: {
      student: { schoolId },
      ...(assignments.length
        ? {
            subjectId: { in: subjectIds },
            termId: { in: termIds },
          }
        : {
            ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
            ...(filter.termId ? { termId: filter.termId } : {}),
          }),
      ...(filter.studentId ? { studentId: filter.studentId } : {}),
    },
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true } },
          enrollments: {
            select: {
              classId: true,
              yearId: true,
              class: { select: { name: true } },
            },
          },
        },
      },
      subject: { select: { id: true, name: true } },
      term: { select: { id: true, name: true, yearId: true } },
    },
    orderBy: [{ student: { indexNumber: "asc" } }, { subject: { name: "asc" } }],
  });

  const assignmentKeySet = new Set(assignments.map((a) => `${a.subjectId}|${a.termId}|${a.classId}`));

  const filteredRows = scores
    .map((s) => {
      let matchedClassName = "";
      let matchedClassId = "";

      for (const enrollment of s.student.enrollments) {
        if (enrollment.yearId !== s.term.yearId) continue;

        if (assignments.length === 0) {
          if (!filter.classId || enrollment.classId === filter.classId) {
            matchedClassName = enrollment.class.name;
            matchedClassId = enrollment.classId;
            break;
          }
          continue;
        }

        const key = `${s.subject.id}|${s.term.id}|${enrollment.classId}`;
        if (assignmentKeySet.has(key)) {
          matchedClassName = enrollment.class.name;
          matchedClassId = enrollment.classId;
          break;
        }
      }

      if (!matchedClassId) return null;
      if (filter.classId && matchedClassId !== filter.classId) return null;

      return [
        s.student.indexNumber,
        `${s.student.user.firstName} ${s.student.user.lastName}`,
        matchedClassName,
        s.subject.name,
        s.term.name,
        s.classScore ?? "",
        s.examScore ?? "",
        s.totalScore != null ? Number(s.totalScore) : "",
        s.grade ?? "",
        s.remark ?? "",
      ] as (string | number | null | undefined)[];
    })
    .filter((row): row is (string | number | null | undefined)[] => row !== null);

  const wb = buildWorkbook(headers, filteredRows);
  return {
    buffer: toBuffer(wb, format),
    filename: `scores_export_${Date.now()}.${format}`,
    contentType: contentType(format),
  };
}
