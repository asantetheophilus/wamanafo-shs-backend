// ============================================================
// Wamanafo SHS — Score Types
// ============================================================

import { ScoreStatus } from "../lib/enums";

export interface ScoreDTO {
  id:          string;
  studentId:   string;
  subjectId:   string;
  termId:      string;
  classScore:  number | null;
  examScore:   number | null;
  totalScore:  number | null;  // computed, 2dp stored
  grade:       string | null;
  gradePoint:  number | null;
  remark:      string | null;
  status:      ScoreStatus;
  submittedAt: string | null;
  approvedAt:  string | null;
  amendmentReason: string | null;
  student: {
    id:          string;
    indexNumber: string;
    user: { firstName: string; lastName: string };
  };
  subject: { id: string; name: string; code: string; isCore: boolean };
  term:    {
    id:              string;
    name:            string;
    classScoreWeight: number;
    examScoreWeight:  number;
  };
}

/** Compact row for the score entry grid */
export interface ScoreGridRow {
  scoreId:     string | null;  // null = no record yet
  studentId:   string;
  indexNumber: string;
  firstName:   string;
  lastName:    string;
  classScore:  number | null;
  examScore:   number | null;
  totalScore:  number | null;
  grade:       string | null;
  gradePoint:  number | null;
  status:      ScoreStatus | null;  // null = no record yet
}

/** Row for admin approval list */
export interface ScoreApprovalRow {
  scoreId:     string;
  studentName: string;
  indexNumber: string;
  subjectName: string;
  className:   string;
  classScore:  number | null;
  examScore:   number | null;
  totalScore:  number | null;
  grade:       string | null;
  status:      ScoreStatus;
  submittedAt: string | null;
  amendmentReason: string | null;
}

export interface ScoreAuditLogDTO {
  id:          string;
  scoreId:     string;
  changedBy:   string;
  action:      string;
  beforeState: Record<string, unknown> | null;
  afterState:  Record<string, unknown> | null;
  reason:      string | null;
  createdAt:   string;
}
