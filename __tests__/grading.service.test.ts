// ============================================================
// Wamanafo SHS — Grading Service Logic Tests
// Tests the pure computation functions used by grading.service.ts
// DB interactions are tested via integration tests (seed assertions).
// ============================================================

import { describe, it, expect } from "vitest";
import { computeAggregate, computeTotalScore, getGrade } from "../src/lib/grading";
import { rankBySubjectScore, rankByOverall } from "../src/lib/ranking";

// ── Score computation edge cases ─────────────────────────────

describe("score computation — edge cases", () => {
  it("a score of 0 is valid and computes a total", () => {
    // 0 classScore with 80 examScore: (0/100×30) + (80/100×70) = 56
    expect(computeTotalScore(0, 80, 30, 70)).toBe(56);
  });

  it("null classScore makes totalScore null — not zero", () => {
    expect(computeTotalScore(null, 80, 30, 70)).toBeNull();
  });

  it("null examScore makes totalScore null — not zero", () => {
    expect(computeTotalScore(60, null, 30, 70)).toBeNull();
  });

  it("weights summing to 100 with non-standard split", () => {
    // 40/60 weights: (50/100×40) + (70/100×60) = 20 + 42 = 62
    expect(computeTotalScore(50, 70, 40, 60)).toBe(62);
  });

  it("perfect score returns 100", () => {
    expect(computeTotalScore(100, 100, 30, 70)).toBe(100);
  });

  it("both zero returns 0 (not null)", () => {
    expect(computeTotalScore(0, 0, 30, 70)).toBe(0);
  });
});

// ── Grade boundaries — every boundary point ──────────────────

describe("getGrade — all 9 boundaries", () => {
  const cases: Array<[number, string, number]> = [
    [100,  "A1", 1], [80.0, "A1", 1],
    [79.9, "B2", 2], [75.0, "B2", 2],
    [74.9, "B3", 3], [70.0, "B3", 3],
    [69.9, "C4", 4], [65.0, "C4", 4],
    [64.9, "C5", 5], [60.0, "C5", 5],
    [59.9, "C6", 6], [55.0, "C6", 6],
    [54.9, "D7", 7], [50.0, "D7", 7],
    [49.9, "E8", 8], [45.0, "E8", 8],
    [44.9, "F9", 9], [0,    "F9", 9],
  ];

  for (const [score, grade, gp] of cases) {
    it(`${score} → ${grade} (GP ${gp})`, () => {
      const r = getGrade(score);
      expect(r?.grade).toBe(grade);
      expect(r?.gradePoint).toBe(gp);
    });
  }
});

// ── Aggregate rules ───────────────────────────────────────────

describe("computeAggregate", () => {
  const mk = (id: string, isCore: boolean, total: number | null) =>
    ({ subjectId: id, isCore, totalScore: total });

  it("selects best 3 core and best 3 elective by grade point (lower = better)", () => {
    const subjects = [
      mk("eng",  true,  90),  // A1 GP1
      mk("math", true,  85),  // A1 GP1
      mk("isci", true,  72),  // B3 GP3
      mk("sost", true,  58),  // C6 GP6 — NOT used (4th core)
      mk("emat", false, 88),  // A1 GP1
      mk("phy",  false, 76),  // B2 GP2
      mk("chem", false, 55),  // C6 GP6
      mk("bio",  false, 48),  // E8 GP8 — NOT used (4th elective)
    ];
    const { aggregate } = computeAggregate(subjects);
    // Best 3 core: GP1+GP1+GP3 = 5
    // Best 3 elective: GP1+GP2+GP6 = 9
    // Total = 14
    expect(aggregate).toBe(14);
  });

  it("aggregate is null when fewer than 3 valid core grades", () => {
    const subjects = [
      mk("eng",  true,  90),
      mk("math", true,  null),  // missing
      mk("isci", true,  72),
      // Only 2 valid core
      mk("emat", false, 88),
      mk("phy",  false, 76),
      mk("chem", false, 55),
    ];
    expect(computeAggregate(subjects).aggregate).toBeNull();
  });

  it("aggregate is null when fewer than 3 valid elective grades", () => {
    const subjects = [
      mk("eng",  true,  90),
      mk("math", true,  85),
      mk("isci", true,  72),
      mk("emat", false, 88),
      mk("phy",  false, null), // missing
      // Only 1 valid elective
    ];
    expect(computeAggregate(subjects).aggregate).toBeNull();
  });

  it("minimum aggregate is 6 (all A1s)", () => {
    const subjects = [
      mk("e1", true,  92), mk("e2", true,  95), mk("e3", true,  88),
      mk("e4", false, 91), mk("e5", false, 90), mk("e6", false, 93),
    ];
    expect(computeAggregate(subjects).aggregate).toBe(6);
  });

  it("maximum aggregate is 54 (all F9s with 3+3 valid)", () => {
    const subjects = [
      mk("e1", true,  30), mk("e2", true,  20), mk("e3", true,  10),
      mk("e4", false, 40), mk("e5", false, 15), mk("e6", false, 25),
    ];
    // All F9 GP9: 6 × 9 = 54
    expect(computeAggregate(subjects).aggregate).toBe(54);
  });

  it("identifies correct used subject IDs for audit", () => {
    const subjects = [
      mk("eng",  true,  85), // A1 GP1 — selected
      mk("math", true,  72), // B3 GP3 — selected
      mk("isci", true,  67), // C4 GP4 — selected
      mk("sost", true,  57), // C6 GP6 — NOT selected (4th)
      mk("emat", false, 85), // A1 GP1 — selected
      mk("phy",  false, 76), // B2 GP2 — selected
      mk("chem", false, 62), // C5 GP5 — selected
    ];
    const { usedCoreSubjectIds, usedElectiveSubjectIds } = computeAggregate(subjects);
    expect(usedCoreSubjectIds).toContain("eng");
    expect(usedCoreSubjectIds).toContain("math");
    expect(usedCoreSubjectIds).toContain("isci");
    expect(usedCoreSubjectIds).not.toContain("sost");
    expect(usedElectiveSubjectIds).toContain("emat");
    expect(usedElectiveSubjectIds).toContain("phy");
    expect(usedElectiveSubjectIds).toContain("chem");
  });
});

// ── DENSE subject ranking ─────────────────────────────────────

describe("rankBySubjectScore — production scenarios", () => {
  it("class of 30 with several ties ranks correctly", () => {
    const students = [
      { studentId: "s1",  totalScore: 92 },
      { studentId: "s2",  totalScore: 92 },  // tied with s1
      { studentId: "s3",  totalScore: 88 },
      { studentId: "s4",  totalScore: 88 },  // tied with s3
      { studentId: "s5",  totalScore: 85 },
      { studentId: "s6",  totalScore: null }, // ungraded
    ];
    const ranked = rankBySubjectScore(students);
    const pos = (id: string) => ranked.find((r) => r.studentId === id)?.position;

    expect(pos("s1")).toBe(1);
    expect(pos("s2")).toBe(1);
    expect(pos("s3")).toBe(2); // DENSE: after 2-way tie at 1 → 2
    expect(pos("s4")).toBe(2);
    expect(pos("s5")).toBe(3); // after 2-way tie at 2 → 3
    expect(pos("s6")).toBeNull();
  });

  it("position 2 follows three-way tie at 1 (not position 4)", () => {
    const students = [
      { studentId: "a", totalScore: 80 },
      { studentId: "b", totalScore: 80 },
      { studentId: "c", totalScore: 80 },
      { studentId: "d", totalScore: 70 },
    ];
    const ranked = rankBySubjectScore(students);
    expect(ranked.find((r) => r.studentId === "d")?.position).toBe(2);
  });
});

// ── DENSE overall ranking ─────────────────────────────────────

describe("rankByOverall — tie-breaking with average", () => {
  it("same total but higher average wins", () => {
    const students = [
      { studentId: "s1", overallTotal: 400, overallAverage: 80.0 },
      { studentId: "s2", overallTotal: 400, overallAverage: 75.0 },
    ];
    const ranked = rankByOverall(students);
    expect(ranked.find((r) => r.studentId === "s1")?.position).toBe(1);
    expect(ranked.find((r) => r.studentId === "s2")?.position).toBe(2);
  });

  it("identical total and average share the same DENSE rank", () => {
    const students = [
      { studentId: "s1", overallTotal: 400, overallAverage: 80.0 },
      { studentId: "s2", overallTotal: 400, overallAverage: 80.0 },
      { studentId: "s3", overallTotal: 350, overallAverage: 70.0 },
    ];
    const ranked = rankByOverall(students);
    expect(ranked.find((r) => r.studentId === "s1")?.position).toBe(1);
    expect(ranked.find((r) => r.studentId === "s2")?.position).toBe(1);
    // DENSE: next after 2-way tie at 1 is 2, not 3
    expect(ranked.find((r) => r.studentId === "s3")?.position).toBe(2);
  });

  it("student with null overallTotal is unranked", () => {
    const students = [
      { studentId: "s1", overallTotal: 400,  overallAverage: 80.0  },
      { studentId: "s2", overallTotal: null, overallAverage: null  },
    ];
    const ranked = rankByOverall(students);
    expect(ranked.find((r) => r.studentId === "s1")?.position).toBe(1);
    expect(ranked.find((r) => r.studentId === "s2")?.position).toBeNull();
  });
});

// ── Withdrawn students excluded from rankings ─────────────────

describe("withdrawn student handling", () => {
  it("a student with no approved scores is unranked for all subjects", () => {
    // Simulated: withdrawn student has no scores → all null
    const students = [
      { studentId: "active",    totalScore: 85   },
      { studentId: "withdrawn", totalScore: null }, // no scores
    ];
    const ranked = rankBySubjectScore(students);
    expect(ranked.find((r) => r.studentId === "withdrawn")?.position).toBeNull();
    // Active student is still ranked 1
    expect(ranked.find((r) => r.studentId === "active")?.position).toBe(1);
  });
});

// ── Score 0 vs null distinction ───────────────────────────────

describe("score 0 vs null distinction", () => {
  it("score of 0 still gets a grade (F9)", () => {
    const total = computeTotalScore(0, 0, 30, 70);
    expect(total).toBe(0);
    const grade = getGrade(0);
    expect(grade?.grade).toBe("F9");
    expect(grade?.gradePoint).toBe(9);
  });

  it("null score produces no grade", () => {
    expect(getGrade(null)).toBeNull();
    expect(computeTotalScore(null, null, 30, 70)).toBeNull();
  });

  it("a score of 0 ranks above a student with null score", () => {
    const students = [
      { studentId: "zero",    totalScore: 0    },
      { studentId: "missing", totalScore: null },
    ];
    const ranked = rankBySubjectScore(students);
    expect(ranked.find((r) => r.studentId === "zero")?.position).toBe(1);
    expect(ranked.find((r) => r.studentId === "missing")?.position).toBeNull();
  });
});
