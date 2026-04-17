// ============================================================
// Wamanafo SHS — DENSE Ranking Helpers
// Implements DENSE ranking as required by GES policy.
// Tied students share the same rank; no rank is skipped.
// ============================================================

// ============================================================
// Types
// ============================================================

export interface StudentScoreRow {
  studentId: string;
  totalScore: number | null; // null = unranked
}

export interface RankedStudent {
  studentId: string;
  totalScore: number | null;
  position: number | null; // null = no valid score
}

export interface StudentOverallRow {
  studentId: string;
  overallTotal: number | null;
  overallAverage: number | null;
}

export interface RankedOverallStudent {
  studentId: string;
  overallTotal: number | null;
  overallAverage: number | null;
  position: number | null;
}

// ============================================================
// Subject Ranking
// ============================================================

/**
 * Apply DENSE ranking to a list of student scores for a single subject.
 *
 * Rules:
 * - Null totalScore → position is null (excluded from ranking).
 * - Tied students share the same position.
 * - No position is skipped after a tie (DENSE).
 * - Sorted descending by totalScore.
 */
export function rankBySubjectScore(students: StudentScoreRow[]): RankedStudent[] {
  // Separate ranked (has score) from unranked
  const withScore    = students.filter((s) => s.totalScore !== null) as Array<StudentScoreRow & { totalScore: number }>;
  const withoutScore = students.filter((s) => s.totalScore === null);

  // Sort descending
  withScore.sort((a, b) => b.totalScore - a.totalScore);

  // Assign DENSE ranks
  const ranked: RankedStudent[] = [];
  let currentRank = 1;
  let previousScore: number | null = null;

  for (const student of withScore) {
    if (previousScore !== null && student.totalScore !== previousScore) {
      currentRank++;
    }
    ranked.push({ studentId: student.studentId, totalScore: student.totalScore, position: currentRank });
    previousScore = student.totalScore;
  }

  // Unranked students
  for (const student of withoutScore) {
    ranked.push({ studentId: student.studentId, totalScore: null, position: null });
  }

  return ranked;
}

// ============================================================
// Overall Class Ranking
// ============================================================

/**
 * Rank students within a class overall.
 *
 * Primary sort:  overallTotal descending.
 * Tie-breaker:   overallAverage descending.
 * Students with no scored subjects (null totals) are unranked.
 * DENSE ranking applied — ties share position, no position skipped.
 */
export function rankByOverall(students: StudentOverallRow[]): RankedOverallStudent[] {
  const withTotal    = students.filter((s) => s.overallTotal !== null) as Array<StudentOverallRow & { overallTotal: number; overallAverage: number }>;
  const withoutTotal = students.filter((s) => s.overallTotal === null);

  // Sort: overallTotal desc, then overallAverage desc as tie-breaker
  withTotal.sort((a, b) => {
    if (b.overallTotal !== a.overallTotal) return b.overallTotal - a.overallTotal;
    return (b.overallAverage ?? 0) - (a.overallAverage ?? 0);
  });

  const ranked: RankedOverallStudent[] = [];
  let currentRank = 1;
  let prevTotal: number | null = null;
  let prevAverage: number | null = null;

  for (const student of withTotal) {
    const sameAsLast =
      prevTotal !== null &&
      student.overallTotal === prevTotal &&
      student.overallAverage === prevAverage;

    if (!sameAsLast && prevTotal !== null) {
      currentRank++;
    }

    ranked.push({
      studentId: student.studentId,
      overallTotal: student.overallTotal,
      overallAverage: student.overallAverage,
      position: currentRank,
    });

    prevTotal   = student.overallTotal;
    prevAverage = student.overallAverage;
  }

  // Unranked students
  for (const student of withoutTotal) {
    ranked.push({
      studentId: student.studentId,
      overallTotal: null,
      overallAverage: null,
      position: null,
    });
  }

  return ranked;
}

// ============================================================
// Formatting helpers
// ============================================================

/**
 * Format a position for display.
 * Handles shared positions (e.g. "3rd") and null (unranked).
 */
export function formatPosition(position: number | null): string {
  if (position === null) return "—";
  const suffix = getOrdinalSuffix(position);
  return `${position}${suffix}`;
}

function getOrdinalSuffix(n: number): string {
  const abs = Math.abs(n);
  const lastTwo  = abs % 100;
  const lastOne  = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";
  if (lastOne === 1) return "st";
  if (lastOne === 2) return "nd";
  if (lastOne === 3) return "rd";
  return "th";
}
