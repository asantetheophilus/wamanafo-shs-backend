// ============================================================
// Wamanafo SHS — Ranking Unit Tests
// ============================================================

import { describe, it, expect } from "vitest";
import { rankBySubjectScore, rankByOverall, formatPosition } from "../src/lib/ranking";

// ============================================================
// rankBySubjectScore
// ============================================================

describe("rankBySubjectScore", () => {
  it("assigns position 1 to the highest scorer", () => {
    const students = [
      { studentId: "s1", totalScore: 85 },
      { studentId: "s2", totalScore: 72 },
      { studentId: "s3", totalScore: 60 },
    ];
    const ranked = rankBySubjectScore(students);
    const s1 = ranked.find((r) => r.studentId === "s1");
    expect(s1?.position).toBe(1);
  });

  it("assigns consecutive DENSE ranks", () => {
    const students = [
      { studentId: "s1", totalScore: 85 },
      { studentId: "s2", totalScore: 72 },
      { studentId: "s3", totalScore: 60 },
    ];
    const ranked = rankBySubjectScore(students);
    const ranks = ranked.map((r) => r.position).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(ranks).toEqual([1, 2, 3]);
  });

  it("gives tied students the same rank (DENSE)", () => {
    const students = [
      { studentId: "s1", totalScore: 85 },
      { studentId: "s2", totalScore: 85 },
      { studentId: "s3", totalScore: 70 },
    ];
    const ranked = rankBySubjectScore(students);
    const s1 = ranked.find((r) => r.studentId === "s1");
    const s2 = ranked.find((r) => r.studentId === "s2");
    const s3 = ranked.find((r) => r.studentId === "s3");
    expect(s1?.position).toBe(1);
    expect(s2?.position).toBe(1);
    // DENSE: next rank after two-way tie at 1 is 2 (not 3)
    expect(s3?.position).toBe(2);
  });

  it("does not skip ranks after a tie", () => {
    const students = [
      { studentId: "s1", totalScore: 90 },
      { studentId: "s2", totalScore: 90 },
      { studentId: "s3", totalScore: 90 },
      { studentId: "s4", totalScore: 60 },
    ];
    const ranked = rankBySubjectScore(students);
    const s4 = ranked.find((r) => r.studentId === "s4");
    expect(s4?.position).toBe(2); // DENSE: three-way tie at 1 → next is 2
  });

  it("assigns null position to students with null totalScore", () => {
    const students = [
      { studentId: "s1", totalScore: 85 },
      { studentId: "s2", totalScore: null },
    ];
    const ranked = rankBySubjectScore(students);
    const s2 = ranked.find((r) => r.studentId === "s2");
    expect(s2?.position).toBeNull();
  });

  it("handles all students unranked", () => {
    const students = [
      { studentId: "s1", totalScore: null },
      { studentId: "s2", totalScore: null },
    ];
    const ranked = rankBySubjectScore(students);
    expect(ranked.every((r) => r.position === null)).toBe(true);
  });

  it("handles a single student", () => {
    const students = [{ studentId: "s1", totalScore: 74 }];
    const ranked = rankBySubjectScore(students);
    expect(ranked[0]!.position).toBe(1);
  });

  it("excludes null-score students from rank numbering", () => {
    const students = [
      { studentId: "s1", totalScore: 80 },
      { studentId: "s2", totalScore: null },
      { studentId: "s3", totalScore: 70 },
    ];
    const ranked = rankBySubjectScore(students);
    const s1 = ranked.find((r) => r.studentId === "s1");
    const s3 = ranked.find((r) => r.studentId === "s3");
    expect(s1?.position).toBe(1);
    expect(s3?.position).toBe(2); // null student does not occupy a rank slot
  });
});

// ============================================================
// rankByOverall
// ============================================================

describe("rankByOverall", () => {
  it("ranks by overallTotal descending", () => {
    const students = [
      { studentId: "s1", overallTotal: 500, overallAverage: 62.5 },
      { studentId: "s2", overallTotal: 600, overallAverage: 75.0 },
      { studentId: "s3", overallTotal: 450, overallAverage: 56.25 },
    ];
    const ranked = rankByOverall(students);
    expect(ranked.find((r) => r.studentId === "s2")?.position).toBe(1);
    expect(ranked.find((r) => r.studentId === "s1")?.position).toBe(2);
    expect(ranked.find((r) => r.studentId === "s3")?.position).toBe(3);
  });

  it("uses overallAverage as tie-breaker", () => {
    const students = [
      { studentId: "s1", overallTotal: 500, overallAverage: 62.0 },
      { studentId: "s2", overallTotal: 500, overallAverage: 64.0 }, // higher average wins
    ];
    const ranked = rankByOverall(students);
    expect(ranked.find((r) => r.studentId === "s2")?.position).toBe(1);
    expect(ranked.find((r) => r.studentId === "s1")?.position).toBe(2);
  });

  it("applies DENSE ranking — tied totals AND averages share the same position", () => {
    const students = [
      { studentId: "s1", overallTotal: 500, overallAverage: 62.5 },
      { studentId: "s2", overallTotal: 500, overallAverage: 62.5 },
      { studentId: "s3", overallTotal: 400, overallAverage: 50.0 },
    ];
    const ranked = rankByOverall(students);
    expect(ranked.find((r) => r.studentId === "s1")?.position).toBe(1);
    expect(ranked.find((r) => r.studentId === "s2")?.position).toBe(1);
    expect(ranked.find((r) => r.studentId === "s3")?.position).toBe(2); // DENSE
  });

  it("assigns null position to students with null overallTotal", () => {
    const students = [
      { studentId: "s1", overallTotal: 500, overallAverage: 62.5 },
      { studentId: "s2", overallTotal: null, overallAverage: null },
    ];
    const ranked = rankByOverall(students);
    expect(ranked.find((r) => r.studentId === "s2")?.position).toBeNull();
  });
});

// ============================================================
// formatPosition
// ============================================================

describe("formatPosition", () => {
  it("returns '—' for null", () => {
    expect(formatPosition(null)).toBe("—");
  });

  it("formats 1 as '1st'", () => {
    expect(formatPosition(1)).toBe("1st");
  });

  it("formats 2 as '2nd'", () => {
    expect(formatPosition(2)).toBe("2nd");
  });

  it("formats 3 as '3rd'", () => {
    expect(formatPosition(3)).toBe("3rd");
  });

  it("formats 4 as '4th'", () => {
    expect(formatPosition(4)).toBe("4th");
  });

  it("formats 11 as '11th'", () => {
    expect(formatPosition(11)).toBe("11th");
  });

  it("formats 12 as '12th'", () => {
    expect(formatPosition(12)).toBe("12th");
  });

  it("formats 21 as '21st'", () => {
    expect(formatPosition(21)).toBe("21st");
  });
});
