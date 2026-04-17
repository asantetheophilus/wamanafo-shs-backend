// ============================================================
// Wamanafo SHS — Report Card Types
// ============================================================

export type ReportCardStatus = "DRAFT" | "PUBLISHED";

/** Full data payload for rendering a report card — screen or PDF */
export interface ReportCardData {
  // Identifiers
  reportCardId: string;
  status:       ReportCardStatus;
  publishedAt:  string | null;

  // School
  school: {
    name:         string;
    logoUrl:      string | null;
    motto:        string | null;
    address:      string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  };

  // Term + Year
  term: {
    name:            string;
    number:          number;
    classScoreWeight: number;
    examScoreWeight:  number;
    totalSchoolDays:  number;
  };
  year: { name: string };

  // Student
  student: {
    id:          string;
    firstName:   string;
    lastName:    string;
    indexNumber: string;
    dateOfBirth: string | null;
  };

  // Class + Programme
  class:     { name: string };
  programme: { name: string };

  // Subject results — each row in the report card table
  subjects: Array<{
    name:       string;
    code:       string;
    isCore:     boolean;
    classScore: number | null;
    examScore:  number | null;
    totalScore: number | null;
    grade:      string | null;
    gradePoint: number | null;
    remark:     string | null;
    position:   number | null; // subject rank within class
  }>;

  // Summary
  overallTotal:         number | null;
  overallAverage:       number | null;
  classPosition:        number | null;
  attendancePercentage: number | null;
  daysAbsent:           number;
  aggregate:            number | null;

  // Conduct
  conductRatings: Array<{
    criterion: string;
    rating:    string;
    remark:    string | null;
  }>;
  formMasterRemark: string | null;

  // Headteacher
  headteacherName: string | null;
  generatedAt:     string | null;
}

/** List row for the admin report cards table */
export interface ReportCardListRow {
  id:              string;
  studentId:       string;
  studentName:     string;
  indexNumber:     string;
  className:       string;
  termName:        string;
  status:          ReportCardStatus;
  classPosition:   number | null;
  aggregate:       number | null;
  publishedAt:     string | null;
  generatedAt:     string | null;
}

/** Prerequisites check result */
export interface ReportCardPrerequisites {
  ready:   boolean;
  missing: string[];  // human-readable list of what's missing
}
