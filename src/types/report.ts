// ============================================================
// Wamanafo SHS — Report / Grading Computed Types
// ============================================================

/** One student's computed result for a single subject in a term */
export interface SubjectResult {
  subjectId:  string;
  subjectName: string;
  subjectCode: string;
  isCore:      boolean;
  classScore:  number | null;
  examScore:   number | null;
  totalScore:  number | null;
  grade:       string | null;
  gradePoint:  number | null;
  remark:      string | null;
  subjectRank: number | null;   // DENSE rank within this class for this subject
}

/** Full computed result for one student for a term */
export interface StudentTermResult {
  studentId:    string;
  indexNumber:  string;
  firstName:    string;
  lastName:     string;
  subjects:     SubjectResult[];
  // Aggregations
  overallTotal:   number | null;  // sum of all totalScores
  overallAverage: number | null;  // mean of all totalScores (2dp)
  classPosition:  number | null;  // DENSE rank within class
  aggregate:      number | null;  // best 3 core + best 3 elective GPs; null if incomplete
  // Attendance snapshot (populated when requested)
  attendancePercentage: number | null;
  daysAbsent:           number;
}

/** Summary row used in the class results table */
export interface ClassResultRow {
  studentId:      string;
  indexNumber:    string;
  firstName:      string;
  lastName:       string;
  overallTotal:   number | null;
  overallAverage: number | null;
  classPosition:  number | null;
  aggregate:      number | null;
  subjectCount:   number;
  gradedCount:    number;  // subjects with non-null totalScore
}

/** Subject-level ranking row for display */
export interface SubjectRankingRow {
  studentId:   string;
  indexNumber: string;
  firstName:   string;
  lastName:    string;
  classScore:  number | null;
  examScore:   number | null;
  totalScore:  number | null;
  grade:       string | null;
  gradePoint:  number | null;
  remark:      string | null;
  position:    number | null;
}
