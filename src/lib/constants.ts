// ============================================================
// Wamanafo SHS — System-Wide Constants
// Single source of truth. Import from here; never hard-code.
// ============================================================

// ------------------------------------------------------------
// Wamanafo SHS Grading Scale (GES policy — do not modify)
// ------------------------------------------------------------
export interface GradeDefinition {
  grade: string;
  minScore: number;
  maxScore: number;
  remark: string;
  gradePoint: number;
  interpretation: string;
}

export const GRADING_SCALE: GradeDefinition[] = [
  { grade: "A1", minScore: 80.0,  maxScore: 100.0, remark: "Excellent",  gradePoint: 1, interpretation: "Strong Pass"   },
  { grade: "B2", minScore: 75.0,  maxScore: 79.9,  remark: "Very Good",  gradePoint: 2, interpretation: "Strong Pass"   },
  { grade: "B3", minScore: 70.0,  maxScore: 74.9,  remark: "Good",       gradePoint: 3, interpretation: "Strong Pass"   },
  { grade: "C4", minScore: 65.0,  maxScore: 69.9,  remark: "Credit",     gradePoint: 4, interpretation: "Pass"          },
  { grade: "C5", minScore: 60.0,  maxScore: 64.9,  remark: "Credit",     gradePoint: 5, interpretation: "Pass"          },
  { grade: "C6", minScore: 55.0,  maxScore: 59.9,  remark: "Credit",     gradePoint: 6, interpretation: "Pass"          },
  { grade: "D7", minScore: 50.0,  maxScore: 54.9,  remark: "Pass",       gradePoint: 7, interpretation: "Borderline"    },
  { grade: "E8", minScore: 45.0,  maxScore: 49.9,  remark: "Pass",       gradePoint: 8, interpretation: "Borderline"    },
  { grade: "F9", minScore: 0.0,   maxScore: 44.9,  remark: "Fail",       gradePoint: 9, interpretation: "Must Repeat"   },
];

// ------------------------------------------------------------
// Academic Structure
// ------------------------------------------------------------
export const TERMS_PER_YEAR = 3 as const;

export const CORE_SUBJECT_NAMES = [
  "English Language",
  "Mathematics",
  "Integrated Science",
  "Social Studies",
] as const;

// Number of best core/elective grades used for aggregate
export const AGGREGATE_CORE_COUNT = 3 as const;
export const AGGREGATE_ELECTIVE_COUNT = 3 as const;
export const AGGREGATE_TOTAL_COUNT = AGGREGATE_CORE_COUNT + AGGREGATE_ELECTIVE_COUNT;

// ------------------------------------------------------------
// Score Weights (defaults — configurable per Term)
// ------------------------------------------------------------
export const DEFAULT_CLASS_SCORE_WEIGHT = 30 as const;
export const DEFAULT_EXAM_SCORE_WEIGHT  = 70 as const;

// Score input validation
export const SCORE_MIN = 0 as const;
export const SCORE_MAX = 100 as const;

// ------------------------------------------------------------
// Attendance
// ------------------------------------------------------------
export const ATTENDANCE_WARNING_THRESHOLD_PERCENT = 75 as const;

// Statuses that count toward the present fraction
export const ATTENDANCE_PRESENT_STATUSES: string[] = ["PRESENT", "LATE"];

// ------------------------------------------------------------
// Report Card
// ------------------------------------------------------------
export const REPORT_CARD_DRAFT_WATERMARK = "DRAFT" as const;

// ------------------------------------------------------------
// Conduct Criteria (default set — admin can configure)
// ------------------------------------------------------------
export const DEFAULT_CONDUCT_CRITERIA = [
  "Punctuality",
  "Behaviour",
  "Participation",
  "Neatness",
  "Respect",
] as const;

export const CONDUCT_RATINGS = ["Excellent", "Good", "Fair", "Poor"] as const;

// ------------------------------------------------------------
// Pagination
// ------------------------------------------------------------
export const DEFAULT_PAGE_SIZE = 20 as const;
export const MAX_PAGE_SIZE     = 100 as const;

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours
export const LOGIN_RATE_LIMIT_MAX    = 5 as const;    // attempts
export const LOGIN_RATE_LIMIT_WINDOW = 60 as const;   // seconds

// ------------------------------------------------------------
// SMS
// ------------------------------------------------------------
export const SMS_MAX_RETRIES       = 3 as const;
export const SMS_RETRY_BASE_DELAY_MS = 5_000 as const; // 5s base, exponential back-off

// ------------------------------------------------------------
// Promotion (Term 3 only)
// ------------------------------------------------------------
export const PROMOTION_TERM_NUMBER = 3 as const;

// ------------------------------------------------------------
// API Error Codes
// ------------------------------------------------------------
export const API_ERROR_CODES = {
  VALIDATION_ERROR:        "VALIDATION_ERROR",
  UNAUTHORIZED:            "UNAUTHORIZED",
  FORBIDDEN:               "FORBIDDEN",
  NOT_FOUND:               "NOT_FOUND",
  CONFLICT:                "CONFLICT",
  SCORE_LOCKED:            "SCORE_LOCKED",
  REPORT_CARD_PUBLISHED:   "REPORT_CARD_PUBLISHED",
  PREREQUISITE_FAILED:     "PREREQUISITE_FAILED",
  INTERNAL_ERROR:          "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

// ------------------------------------------------------------
// Role-based route prefixes
// ------------------------------------------------------------
export const ROLE_ROUTES = {
  ADMIN:   "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
  PARENT:  "/parent",
} as const;

export const PROTECTED_ROUTE_PREFIXES = Object.values(ROLE_ROUTES);
