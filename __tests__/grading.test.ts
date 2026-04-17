// ============================================================
// Wamanafo SHS — Grading Logic Unit Tests
// Covers every grade boundary, aggregate logic, and edge cases.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  computeTotalScore,
  getGrade,
  computeAggregate,
  isPassingGrade,
  formatDisplayScore,
} from "../src/lib/grading";

// ============================================================
// computeTotalScore
// ============================================================

describe("computeTotalScore", () => {
  it("returns null when classScore is null", () => {
    expect(computeTotalScore(null, 80, 30, 70)).toBeNull();
  });

  it("returns null when examScore is null", () => {
    expect(computeTotalScore(70, null, 30, 70)).toBeNull();
  });

  it("returns null when both scores are null", () => {
    expect(computeTotalScore(null, null, 30, 70)).toBeNull();
  });

  it("computes correctly with 30/70 weights", () => {
    // (60/100 × 30) + (80/100 × 70) = 18 + 56 = 74
    expect(computeTotalScore(60, 80, 30, 70)).toBe(74);
  });

  it("computes correctly with 40/60 weights", () => {
    // (50/100 × 40) + (60/100 × 60) = 20 + 36 = 56
    expect(computeTotalScore(50, 60, 40, 60)).toBe(56);
  });

  it("handles zero classScore correctly (not null)", () => {
    // (0/100 × 30) + (70/100 × 70) = 0 + 49 = 49
    expect(computeTotalScore(0, 70, 30, 70)).toBe(49);
  });

  it("handles zero examScore correctly", () => {
    // (100/100 × 30) + (0/100 × 70) = 30 + 0 = 30
    expect(computeTotalScore(100, 0, 30, 70)).toBe(30);
  });

  it("returns 100 when both scores are 100", () => {
    expect(computeTotalScore(100, 100, 30, 70)).toBe(100);
  });

  it("returns 0 when both scores are 0", () => {
    expect(computeTotalScore(0, 0, 30, 70)).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    // (33/100 × 30) + (67/100 × 70) = 9.9 + 46.9 = 56.8
    const result = computeTotalScore(33, 67, 30, 70);
    expect(result).toBe(56.8);
  });
});

// ============================================================
// getGrade — every boundary
// ============================================================

describe("getGrade", () => {
  it("returns null for null totalScore", () => {
    expect(getGrade(null)).toBeNull();
  });

  const gradeBoundaries: Array<[number, string, number]> = [
    [100,  "A1", 1],
    [80.0, "A1", 1],
    [79.9, "B2", 2],
    [75.0, "B2", 2],
    [74.9, "B3", 3],
    [70.0, "B3", 3],
    [69.9, "C4", 4],
    [65.0, "C4", 4],
    [64.9, "C5", 5],
    [60.0, "C5", 5],
    [59.9, "C6", 6],
    [55.0, "C6", 6],
    [54.9, "D7", 7],
    [50.0, "D7", 7],
    [49.9, "E8", 8],
    [45.0, "E8", 8],
    [44.9, "F9", 9],
    [0,    "F9", 9],
  ];

  for (const [score, expectedGrade, expectedPoint] of gradeBoundaries) {
    it(`score ${score} → ${expectedGrade} (GP ${expectedPoint})`, () => {
      const result = getGrade(score);
      expect(result).not.toBeNull();
      expect(result!.grade).toBe(expectedGrade);
      expect(result!.gradePoint).toBe(expectedPoint);
    });
  }

  it("returns correct remark for A1", () => {
    expect(getGrade(90)!.remark).toBe("Excellent");
  });

  it("returns correct remark for F9", () => {
    expect(getGrade(30)!.remark).toBe("Fail");
  });
});

// ============================================================
// computeAggregate
// ============================================================

describe("computeAggregate", () => {
  // Helper: build subject score inputs
  const mkSubject = (id: string, isCore: boolean, totalScore: number | null) => ({
    subjectId: id,
    isCore,
    totalScore,
  });

  it("returns null aggregate when fewer than 3 core subjects have grades", () => {
    const subjects = [
      mkSubject("eng", true,  85),   // A1 GP1
      mkSubject("math", true, 72),   // B3 GP3
      // Only 2 core — insufficient
      mkSubject("emat", false, 80),  // A1 GP1
      mkSubject("phy",  false, 75),  // B2 GP2
      mkSubject("chem", false, 68),  // C4 GP4
    ];
    expect(computeAggregate(subjects).aggregate).toBeNull();
  });

  it("returns null aggregate when fewer than 3 elective subjects have grades", () => {
    const subjects = [
      mkSubject("eng",  true, 85),
      mkSubject("math", true, 72),
      mkSubject("isci", true, 68),
      mkSubject("sost", true, 78),
      mkSubject("emat", false, 80),
      mkSubject("phy",  false, 75),
      // Only 2 electives — insufficient
    ];
    expect(computeAggregate(subjects).aggregate).toBeNull();
  });

  it("computes correct aggregate with best 3+3", () => {
    // Core GPs: ENG=A1(1), MATH=B3(3), ISCI=C4(4), SOST=C6(6)
    // Best 3 core: 1+3+4 = 8
    // Elective GPs: EMAT=A1(1), PHY=B2(2), CHEM=C5(5), BIO=D7(7)
    // Best 3 elective: 1+2+5 = 8
    // Aggregate = 16
    const subjects = [
      mkSubject("eng",  true,  85), // A1 GP1
      mkSubject("math", true,  72), // B3 GP3
      mkSubject("isci", true,  67), // C4 GP4
      mkSubject("sost", true,  57), // C6 GP6
      mkSubject("emat", false, 85), // A1 GP1
      mkSubject("phy",  false, 76), // B2 GP2
      mkSubject("chem", false, 62), // C5 GP5
      mkSubject("bio",  false, 51), // D7 GP7
    ];
    const result = computeAggregate(subjects);
    expect(result.aggregate).toBe(16);
  });

  it("excludes subjects with null totalScore from aggregate", () => {
    const subjects = [
      mkSubject("eng",  true,  85), // A1 GP1
      mkSubject("math", true,  null), // missing — excluded
      mkSubject("isci", true,  67), // C4 GP4
      // Only 2 valid core → null aggregate
      mkSubject("emat", false, 85),
      mkSubject("phy",  false, 76),
      mkSubject("chem", false, 62),
    ];
    expect(computeAggregate(subjects).aggregate).toBeNull();
  });

  it("returns minimum possible aggregate (all A1s)", () => {
    const subjects = [
      mkSubject("eng",  true,  90), // A1 GP1
      mkSubject("math", true,  95), // A1 GP1
      mkSubject("isci", true,  88), // A1 GP1
      mkSubject("emat", false, 92), // A1 GP1
      mkSubject("phy",  false, 85), // A1 GP1
      mkSubject("chem", false, 91), // A1 GP1
    ];
    expect(computeAggregate(subjects).aggregate).toBe(6); // 6 × GP1
  });

  it("lists the correct used subject IDs", () => {
    const subjects = [
      mkSubject("eng",  true,  85), // A1 GP1 — best core
      mkSubject("math", true,  72), // B3 GP3 — best core
      mkSubject("isci", true,  67), // C4 GP4 — best core
      mkSubject("sost", true,  57), // C6 GP6 — NOT selected (4th)
      mkSubject("emat", false, 85), // A1 GP1 — best elective
      mkSubject("phy",  false, 76), // B2 GP2 — best elective
      mkSubject("chem", false, 62), // C5 GP5 — best elective
    ];
    const result = computeAggregate(subjects);
    expect(result.usedCoreSubjectIds).toContain("eng");
    expect(result.usedCoreSubjectIds).toContain("math");
    expect(result.usedCoreSubjectIds).toContain("isci");
    expect(result.usedCoreSubjectIds).not.toContain("sost");
  });
});

// ============================================================
// isPassingGrade
// ============================================================

describe("isPassingGrade", () => {
  it("returns true for grade point 6 (C6)", () => {
    expect(isPassingGrade(6)).toBe(true);
  });

  it("returns true for grade point 1 (A1)", () => {
    expect(isPassingGrade(1)).toBe(true);
  });

  it("returns false for grade point 7 (D7)", () => {
    expect(isPassingGrade(7)).toBe(false);
  });

  it("returns false for grade point 9 (F9)", () => {
    expect(isPassingGrade(9)).toBe(false);
  });
});

// ============================================================
// formatDisplayScore
// ============================================================

describe("formatDisplayScore", () => {
  it("returns '—' for null", () => {
    expect(formatDisplayScore(null)).toBe("—");
  });

  it("formats integer score to 1 decimal", () => {
    expect(formatDisplayScore(74)).toBe("74.0");
  });

  it("formats decimal score to 1 decimal", () => {
    expect(formatDisplayScore(74.56)).toBe("74.6");
  });

  it("formats 0 as '0.0'", () => {
    expect(formatDisplayScore(0)).toBe("0.0");
  });
});
