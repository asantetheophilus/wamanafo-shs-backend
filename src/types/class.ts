// ============================================================
// Wamanafo SHS — Class, Programme & Subject Types
// ============================================================

// ── Programme ─────────────────────────────────────────────────

export interface ProgrammeDTO {
  id:        string;
  name:      string;
  code:      string;
  schoolId:  string;
  createdAt: string;
  subjects:  Array<{ id: string; name: string; code: string; isCore: boolean }>;
  classCount: number;
}

export interface ProgrammeListRow {
  id:         string;
  name:       string;
  code:       string;
  subjectCount: number;
  classCount: number;
}

// ── Class ─────────────────────────────────────────────────────

export interface ClassDTO {
  id:          string;
  name:        string;
  schoolId:    string;
  createdAt:   string;
  year:        { id: string; name: string };
  programme:   { id: string; name: string; code: string };
  formMaster:  {
    id:      string;
    staffId: string;
    user:    { firstName: string; lastName: string; email: string };
  } | null;
  studentCount: number;
}

export interface ClassListRow {
  id:             string;
  name:           string;
  yearName:       string;
  programmeName:  string;
  formMasterName: string | null;
  studentCount:   number;
}

// ── Subject ───────────────────────────────────────────────────

export interface SubjectDTO {
  id:        string;
  name:      string;
  code:      string;
  isCore:    boolean;
  schoolId:  string;
  createdAt: string;
  programmes: Array<{ id: string; name: string; code: string }>;
}

export interface SubjectListRow {
  id:            string;
  name:          string;
  code:          string;
  isCore:        boolean;
  programmeCount: number;
}

// ── Academic Year (lightweight, used in selects) ──────────────

export interface AcademicYearOption {
  id:        string;
  name:      string;
  isCurrent: boolean;
}
