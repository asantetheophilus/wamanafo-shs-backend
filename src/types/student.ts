// ============================================================
// Wamanafo SHS — Student Types
// ============================================================

import { StudentStatus } from "../lib/enums";

/** Full student row as returned by the API */
export interface StudentDTO {
  id: string;
  indexNumber: string;
  status: StudentStatus;
  dateOfBirth: string | null;
  gender: string | null;
  schoolId: string;
  createdAt: string;
  // Joined from User
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  // Current enrollment (may be absent if not enrolled this year)
  currentEnrollment: {
    class: {
      id: string;
      name: string;
      programme: { id: string; name: string };
    };
    year: { id: string; name: string };
  } | null;
}

/** Compact row used in list tables */
export interface StudentListRow {
  id: string;
  indexNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  status: StudentStatus;
  className: string | null;
  programmeName: string | null;
}
