// ============================================================
// Wamanafo SHS — Teacher Types
// ============================================================

/** Full teacher row returned by the API */
export interface TeacherDTO {
  id: string;
  staffId: string;
  schoolId: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
  };
  /** Classes where this teacher is the form master */
  formMasterClasses: Array<{ id: string; name: string }>;
  /** Teaching assignment count for the current term */
  assignmentCount: number;
}

/** Compact row for list tables */
export interface TeacherListRow {
  id: string;
  staffId: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  assignmentCount: number;
  formMasterClass: string | null;
}
