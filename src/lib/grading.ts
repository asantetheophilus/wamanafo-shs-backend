// ============================================================
// Wamanafo SHS — Grading Logic
// Single source of truth for all grade computation.
// Every function here has corresponding unit tests.
// ============================================================

import { GRADING_SCALE, type GradeDefinition, AGGREGATE_CORE_COUNT, AGGREGATE_ELECTIVE_COUNT } from "./constants";

// ============================================================
// Types
// ============================================================

export interface GradeResult {
  grade: string;
  gradePoint: number;
  remark: string;
  interpretation: string;
}

export interface SubjectScoreInput {
  subjectId: string;
  isCore: boolean;
  totalScore: number | null; // null means score is missing
}

export interface AggregateResult {
  aggregate: number | null; // null if prerequisites not met
  usedCoreSubjectIds: string[];
  usedElectiveSubjectIds: string[];
}

// ============================================================
// Score Computation
// ============================================================

/**
 * Compute totalScore from class and exam scores using term weights.
 * Returns null if either score is null (missing data — not zero).
 *
 * Formula: (classScore / 100 × classWeight) + (examScore / 100 × examWeight)
 * Weights must sum to 100.
 */
export function computeTotalScore(
  classScore: number | null,
  examScore: number | null,
  classScoreWeight: number,
  examScoreWeight: number
): number | null {
  // Both components must be present — null means missing, not zero
  if (classScore === null || examScore === null) return null;

  const total =
    (classScore / 100) * classScoreWeight +
    (examScore / 100) * examScoreWeight;

  // Round to 2 decimal precision for storage
  return Math.round(total * 100) / 100;
}

// ============================================================
// Grade Lookup
// ============================================================

/**
 * Look up the grade for a given totalScore.
 * Returns null if totalScore is null (ungraded).
 */
export function getGrade(totalScore: number | null): GradeResult | null {
  if (totalScore === null) return null;

  for (const def of GRADING_SCALE) {
    if (totalScore >= def.minScore && totalScore <= def.maxScore) {
      return {
        grade: def.grade,
        gradePoint: def.gradePoint,
        remark: def.remark,
        interpretation: def.interpretation,
      };
    }
  }

  // Fallback for values outside range (should not happen with validated inputs)
  // A score of exactly 0 should still return F9
  if (totalScore === 0) {
    const f9 = GRADING_SCALE.find((d) => d.grade === "F9")!;
    return {
      grade: f9.grade,
      gradePoint: f9.gradePoint,
      remark: f9.remark,
      interpretation: f9.interpretation,
    };
  }

  return null;
}

/**
 * Get grade definition by grade letter (e.g. "A1").
 */
export function getGradeDefinition(grade: string): GradeDefinition | null {
  return GRADING_SCALE.find((d) => d.grade === grade) ?? null;
}

// ============================================================
// Aggregate Calculation
// ============================================================

/**
 * Compute Wamanafo SHS aggregate score.
 *
 * Rules:
 * - Select best 3 core subjects (lowest grade point = best).
 * - Select best 3 elective subjects.
 * - aggregate = sum of those 6 grade points.
 * - Lower is better.
 * - If fewer than 3 valid core OR fewer than 3 valid elective grades → null.
 * - Subjects with null totalScore are excluded (not graded).
 */
export function computeAggregate(subjects: SubjectScoreInput[]): AggregateResult {
  const coreWithGrades: Array<{ subjectId: string; gradePoint: number }> = [];
  const electiveWithGrades: Array<{ subjectId: string; gradePoint: number }> = [];

  for (const s of subjects) {
    if (s.totalScore === null) continue; // Skip ungraded subjects

    const gradeResult = getGrade(s.totalScore);
    if (!gradeResult) continue;

    const entry = { subjectId: s.subjectId, gradePoint: gradeResult.gradePoint };
    if (s.isCore) {
      coreWithGrades.push(entry);
    } else {
      electiveWithGrades.push(entry);
    }
  }

  // Prerequisite check
  if (
    coreWithGrades.length < AGGREGATE_CORE_COUNT ||
    electiveWithGrades.length < AGGREGATE_ELECTIVE_COUNT
  ) {
    return {
      aggregate: null,
      usedCoreSubjectIds: [],
      usedElectiveSubjectIds: [],
    };
  }

  // Sort ascending by grade point (lower = better) and take top 3 of each
  const bestCore    = [...coreWithGrades].sort((a, b) => a.gradePoint - b.gradePoint).slice(0, AGGREGATE_CORE_COUNT);
  const bestElective = [...electiveWithGrades].sort((a, b) => a.gradePoint - b.gradePoint).slice(0, AGGREGATE_ELECTIVE_COUNT);

  const aggregate =
    bestCore.reduce((sum, s) => sum + s.gradePoint, 0) +
    bestElective.reduce((sum, s) => sum + s.gradePoint, 0);

  return {
    aggregate,
    usedCoreSubjectIds: bestCore.map((s) => s.subjectId),
    usedElectiveSubjectIds: bestElective.map((s) => s.subjectId),
  };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Check whether a grade is a passing grade (C6 or better, grade point ≤ 6).
 */
export function isPassingGrade(gradePoint: number): boolean {
  return gradePoint <= 6;
}

/**
 * Check whether grade point indicates a strong pass (B3 or better, grade point ≤ 3).
 */
export function isStrongPass(gradePoint: number): boolean {
  return gradePoint <= 3;
}

/**
 * Format a totalScore for display — 1 decimal place.
 * Returns "—" for null scores.
 */
export function formatDisplayScore(totalScore: number | null): string {
  if (totalScore === null) return "—";
  return totalScore.toFixed(1);
}
