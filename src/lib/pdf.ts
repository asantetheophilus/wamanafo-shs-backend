// ============================================================
// Wamanafo SHS — Report Card PDF Generation
// Uses @react-pdf/renderer to produce a structured PDF matching
// the screen preview layout exactly.
// Called server-side only — never import in client components.
// ============================================================

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatDisplayScore } from "../lib/grading";
import { formatAttendancePercentage } from "../lib/attendance";
import { formatPosition } from "../lib/ranking";
import { formatDate } from "../lib/utils";
import type { ReportCardData } from "../types/report-card";

// ── Styles ────────────────────────────────────────────────────

const TEAL  = "#0D5E6E";
const GOLD  = "#B8860B";
const GRAY  = "#64748b";
const LIGHT = "#f8fafc";
const BORDER = "#e2e8f0";

const styles = StyleSheet.create({
  page: {
    fontFamily:      "Helvetica",
    fontSize:        9,
    color:           "#1e293b",
    paddingHorizontal: 36,
    paddingVertical:   32,
    backgroundColor: "#ffffff",
  },

  // Header
  header: {
    alignItems:    "center",
    marginBottom:  12,
    borderBottom:  "2pt solid " + TEAL,
    paddingBottom: 10,
  },
  schoolName: {
    fontSize:   16,
    fontFamily: "Helvetica-Bold",
    color:      TEAL,
    textAlign:  "center",
  },
  schoolMotto: {
    fontSize:  9,
    color:     GOLD,
    textAlign: "center",
    marginTop: 2,
    fontFamily: "Helvetica-Oblique",
  },
  schoolContact: {
    fontSize:  8,
    color:     GRAY,
    textAlign: "center",
    marginTop: 3,
  },
  termBadge: {
    marginTop:       6,
    backgroundColor: TEAL,
    color:           "#ffffff",
    paddingHorizontal: 12,
    paddingVertical:   3,
    borderRadius:    4,
    fontSize:        10,
    fontFamily:      "Helvetica-Bold",
  },

  // DRAFT watermark
  watermark: {
    position:   "absolute",
    top:        "40%",
    left:       "15%",
    fontSize:   72,
    color:      "#e2e8f0",
    fontFamily: "Helvetica-Bold",
    transform:  "rotate(-35deg)",
    opacity:    0.4,
  },

  // Student block
  studentBlock: {
    flexDirection:   "row",
    marginBottom:    10,
    padding:         8,
    backgroundColor: LIGHT,
    borderRadius:    4,
    border:          "1pt solid " + BORDER,
  },
  studentField: {
    flex:       1,
    marginRight: 8,
  },
  fieldLabel: {
    fontSize:  7,
    color:     GRAY,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize:  9,
    fontFamily: "Helvetica-Bold",
    marginTop:  1,
  },

  // Section titles
  sectionTitle: {
    fontSize:        9,
    fontFamily:      "Helvetica-Bold",
    color:           TEAL,
    marginBottom:    4,
    marginTop:       8,
    paddingBottom:   2,
    borderBottom:    "1pt solid " + BORDER,
    textTransform:   "uppercase",
    letterSpacing:   0.5,
  },

  // Subject table
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection:   "row",
    backgroundColor: TEAL,
    color:           "#ffffff",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection:     "row",
    paddingVertical:   3,
    paddingHorizontal: 4,
    borderBottom:      "0.5pt solid " + BORDER,
  },
  tableRowAlt: {
    backgroundColor: LIGHT,
  },
  colSubject:    { width: "28%", fontFamily: "Helvetica-Bold" },
  colScore:      { width: "10%", textAlign: "center" },
  colTotal:      { width: "10%", textAlign: "center", fontFamily: "Helvetica-Bold" },
  colGrade:      { width: "8%",  textAlign: "center", fontFamily: "Helvetica-Bold" },
  colGP:         { width: "6%",  textAlign: "center" },
  colRemark:     { width: "18%", textAlign: "center" },
  colPos:        { width: "8%",  textAlign: "center" },
  tableHeaderText: { color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold" },

  // Summary block
  summaryGrid: {
    flexDirection:   "row",
    flexWrap:        "wrap",
    marginTop:       6,
    marginBottom:    8,
    backgroundColor: LIGHT,
    padding:         8,
    borderRadius:    4,
    border:          "1pt solid " + BORDER,
  },
  summaryItem: {
    width:       "25%",
    marginBottom: 6,
  },

  // Conduct
  conductRow: {
    flexDirection: "row",
    marginBottom:  3,
  },
  conductLabel: { width: "40%", color: GRAY },
  conductValue: { width: "20%", fontFamily: "Helvetica-Bold" },
  conductRemark: { width: "40%", color: GRAY, fontFamily: "Helvetica-Oblique" },

  // Signature block
  signatureBlock: {
    flexDirection: "row",
    marginTop:     16,
    borderTop:     "1pt solid " + BORDER,
    paddingTop:    8,
  },
  signatureLine: {
    flex:        1,
    borderBottom: "1pt solid #000000",
    marginBottom: 3,
    height:      20,
  },
  signatureLabel: {
    fontSize: 8,
    color:    GRAY,
  },

  // Footer
  footer: {
    position:    "absolute",
    bottom:      20,
    left:        36,
    right:       36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop:   "0.5pt solid " + BORDER,
    paddingTop:  4,
  },
  footerText: {
    fontSize: 7,
    color:    GRAY,
  },
});

// ── Grade colour ──────────────────────────────────────────────

function gradeColor(gradePoint: number | null): string {
  if (gradePoint === null) return "#64748b";
  if (gradePoint <= 3) return "#15803d";
  if (gradePoint <= 6) return "#a16207";
  if (gradePoint <= 8) return "#c2410c";
  return "#dc2626";
}

// ── PDF Document component ────────────────────────────────────

function ReportCardDocument({ data }: { data: ReportCardData }) {
  const isDraft   = data.status === "DRAFT";
  const coreSubj  = data.subjects.filter((s) => s.isCore);
  const electives = data.subjects.filter((s) => !s.isCore);

  const SubjectRows = ({ subjects }: { subjects: ReportCardData["subjects"] }) =>
    React.createElement(
      React.Fragment,
      null,
      ...subjects.map((s, i) =>
        React.createElement(
          View,
          {
            key: s.code,
            style: [styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}],
          },
          React.createElement(Text, { style: styles.colSubject }, s.name),
          React.createElement(Text, { style: styles.colScore }, s.classScore?.toString() ?? "—"),
          React.createElement(Text, { style: styles.colScore }, s.examScore?.toString() ?? "—"),
          React.createElement(Text, { style: styles.colTotal }, formatDisplayScore(s.totalScore)),
          React.createElement(
            Text,
            { style: [styles.colGrade, { color: gradeColor(s.gradePoint) }] },
            s.grade ?? "—"
          ),
          React.createElement(Text, { style: styles.colGP }, s.gradePoint?.toString() ?? "—"),
          React.createElement(Text, { style: styles.colRemark }, s.remark ?? "—"),
          React.createElement(Text, { style: styles.colPos }, formatPosition(s.position)),
        )
      )
    );

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      // DRAFT watermark
      isDraft &&
        React.createElement(Text, { style: styles.watermark }, "DRAFT"),

      // ── Header ──
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.schoolName }, data.school.name),
        data.school.motto &&
          React.createElement(Text, { style: styles.schoolMotto }, `"${data.school.motto}"`),
        React.createElement(
          Text,
          { style: styles.schoolContact },
          [data.school.address, data.school.contactPhone, data.school.contactEmail]
            .filter(Boolean)
            .join("  |  ")
        ),
        React.createElement(
          Text,
          { style: styles.termBadge },
          `${data.term.name}  ·  ${data.year.name}  ·  End-of-Term Report`
        )
      ),

      // ── Student block ──
      React.createElement(
        View,
        { style: styles.studentBlock },
        ...[
          { label: "Full Name",     value: `${data.student.lastName}, ${data.student.firstName}` },
          { label: "Index Number",  value: data.student.indexNumber },
          { label: "Class",         value: data.class.name },
          { label: "Programme",     value: data.programme.name },
          { label: "Date of Birth", value: formatDate(data.student.dateOfBirth) },
        ].map((f) =>
          React.createElement(
            View,
            { key: f.label, style: styles.studentField },
            React.createElement(Text, { style: styles.fieldLabel }, f.label),
            React.createElement(Text, { style: styles.fieldValue }, f.value)
          )
        )
      ),

      // ── Core subjects table ──
      React.createElement(Text, { style: styles.sectionTitle }, "Core Subjects"),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader },
          ...["Subject", "Cls.", "Exam", "Total", "Grade", "GP", "Remark", "Pos."].map((h, i) => {
            const colStyles: Record<number, object> = {
              0: styles.colSubject,
              1: styles.colScore, 2: styles.colScore,
              3: styles.colTotal, 4: styles.colGrade,
              5: styles.colGP,    6: styles.colRemark,
              7: styles.colPos,
            };
            return React.createElement(
              Text,
              { key: h, style: { ...styles.tableHeaderText, ...(colStyles[i] ?? {}) } } as unknown as object,
              h
            );
          })
        ),
        React.createElement(SubjectRows, { subjects: coreSubj })
      ),

      // ── Elective subjects table ──
      electives.length > 0 &&
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Text, { style: styles.sectionTitle }, "Elective Subjects"),
          React.createElement(
            View,
            { style: styles.table },
            React.createElement(
              View,
              { style: styles.tableHeader },
              ...["Subject", "Cls.", "Exam", "Total", "Grade", "GP", "Remark", "Pos."].map((h, i) => {
                const colStyles: Record<number, object> = {
                  0: styles.colSubject,
                  1: styles.colScore, 2: styles.colScore,
                  3: styles.colTotal, 4: styles.colGrade,
                  5: styles.colGP,    6: styles.colRemark,
                  7: styles.colPos,
                };
                return React.createElement(
                  Text,
                  { key: h, style: { ...styles.tableHeaderText, ...(colStyles[i] ?? {}) } } as unknown as object,
                  h
                );
              })
            ),
            React.createElement(SubjectRows, { subjects: electives })
          )
        ),

      // ── Summary ──
      React.createElement(Text, { style: styles.sectionTitle }, "Summary"),
      React.createElement(
        View,
        { style: styles.summaryGrid },
        ...[
          { label: "Total Marks",   value: formatDisplayScore(data.overallTotal) },
          { label: "Average",       value: formatDisplayScore(data.overallAverage) },
          { label: "Class Position",value: formatPosition(data.classPosition) },
          { label: "Aggregate",     value: data.aggregate?.toString() ?? "Pending" },
          { label: "Attendance",    value: formatAttendancePercentage(data.attendancePercentage) },
          { label: "Days Absent",   value: data.daysAbsent.toString() },
        ].map((item) =>
          React.createElement(
            View,
            { key: item.label, style: styles.summaryItem },
            React.createElement(Text, { style: styles.fieldLabel }, item.label),
            React.createElement(Text, { style: styles.fieldValue }, item.value)
          )
        )
      ),

      // ── Conduct ──
      data.conductRatings.length > 0 &&
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Text, { style: styles.sectionTitle }, "Conduct & Character"),
          ...data.conductRatings.map((c) =>
            React.createElement(
              View,
              { key: c.criterion, style: styles.conductRow },
              React.createElement(Text, { style: styles.conductLabel }, c.criterion),
              React.createElement(
                Text,
                {
                  style: [
                    styles.conductValue,
                    {
                      color:
                        c.rating === "Excellent" ? "#15803d" :
                        c.rating === "Good"      ? "#a16207" :
                        c.rating === "Fair"      ? "#c2410c" : "#dc2626",
                    },
                  ],
                },
                c.rating
              ),
              React.createElement(
                Text,
                { style: styles.conductRemark },
                c.remark ?? ""
              )
            )
          )
        ),

      // Form master remark
      data.formMasterRemark &&
        React.createElement(
          View,
          { style: { marginTop: 6 } },
          React.createElement(
            Text,
            { style: styles.fieldLabel },
            "Form Master's Remark"
          ),
          React.createElement(
            Text,
            { style: [styles.fieldValue, { fontFamily: "Helvetica-Oblique", fontSize: 9 }] },
            data.formMasterRemark
          )
        ),

      // ── Signature block ──
      React.createElement(
        View,
        { style: styles.signatureBlock },
        React.createElement(
          View,
          { style: { flex: 1, marginRight: 24 } },
          React.createElement(View, { style: styles.signatureLine }),
          React.createElement(
            Text,
            { style: styles.signatureLabel },
            data.headteacherName
              ? `Headteacher: ${data.headteacherName}`
              : "Headteacher's Signature"
          )
        ),
        React.createElement(
          View,
          { style: { flex: 1 } },
          React.createElement(
            Text,
            { style: [styles.fieldLabel, { marginBottom: 2 }] },
            "Date"
          ),
          React.createElement(
            Text,
            { style: styles.fieldValue },
            data.publishedAt
              ? formatDate(data.publishedAt)
              : formatDate(new Date().toISOString())
          )
        )
      ),

      // ── Footer ──
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(
          Text,
          { style: styles.footerText },
          data.school.name
        ),
        React.createElement(
          Text,
          { style: styles.footerText },
          `${data.term.name} · ${data.year.name}`,
          React.createElement(
            Text,
            { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `  |  Page ${pageNumber} of ${totalPages}` as unknown as React.ReactNode
            }
          )
        )
      )
    )
  );
}

// ── Public API ────────────────────────────────────────────────

export async function generateReportCardPDF(data: ReportCardData): Promise<Buffer> {
  const element = React.createElement(ReportCardDocument, { data });
  return renderToBuffer(element as React.ReactElement);
}
