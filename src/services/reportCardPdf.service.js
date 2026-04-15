const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function toText(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function gradeFromScore(score) {
  const s = toNumber(score, 0);
  if (s >= 90) return 'A+';
  if (s >= 85) return 'A';
  if (s >= 80) return 'A-';
  if (s >= 75) return 'B+';
  if (s >= 70) return 'B';
  if (s >= 65) return 'B-';
  if (s >= 60) return 'C+';
  if (s >= 55) return 'C';
  if (s >= 50) return 'C-';
  if (s >= 45) return 'D';
  return 'F';
}

function remarkFromScore(score) {
  const s = toNumber(score, 0);
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Very Good';
  if (s >= 60) return 'Good';
  if (s >= 50) return 'Needs Improvement';
  return 'At Risk';
}

async function loadImageBuffer(logoPathOrUrl) {
  if (!logoPathOrUrl) return null;
  const raw = String(logoPathOrUrl).trim();
  if (!raw) return null;

  try {
    if (/^https?:\/\//i.test(raw)) {
      const response = await fetch(raw);
      if (!response.ok) return null;
      const arr = await response.arrayBuffer();
      return Buffer.from(arr);
    }

    const abs = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
    if (!fs.existsSync(abs)) return null;
    return fs.readFileSync(abs);
  } catch {
    return null;
  }
}

function drawTableHeader(doc, startX, y, widths) {
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Subject', startX, y, { width: widths.subject });
  doc.text('Score', startX + widths.subject, y, { width: widths.score, align: 'right' });
  doc.text('Grade', startX + widths.subject + widths.score, y, {
    width: widths.grade,
    align: 'center',
  });
  doc.text('Remarks', startX + widths.subject + widths.score + widths.grade, y, {
    width: widths.remarks,
    align: 'left',
  });

  doc
    .moveTo(startX, y + 16)
    .lineTo(startX + widths.subject + widths.score + widths.grade + widths.remarks, y + 16)
    .strokeColor('#D1D5DB')
    .stroke();
}

/**
 * Stream a structured report card PDF to the HTTP response.
 */
async function generateReportCardPDF(res, reportData) {
  const studentId = toText(reportData?.student?.studentId, 'student');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=report-card-${studentId}.pdf`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left;
  let y = 50;

  const schoolName = toText(reportData?.school?.schoolName, 'Intelli Campus');
  const logoBuffer = await loadImageBuffer(reportData?.school?.logo);

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, startX, y - 8, { fit: [60, 60] });
    } catch {
      // Ignore invalid image data; keep PDF generation resilient.
    }
  }

  doc.font('Helvetica-Bold').fontSize(18).text(schoolName, startX, y, {
    width: pageWidth,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(11).fillColor('#4B5563').text('Student Report Card', {
    width: pageWidth,
    align: 'center',
  });
  doc.fillColor('#111827');

  y += 52;
  doc
    .moveTo(startX, y)
    .lineTo(startX + pageWidth, y)
    .strokeColor('#E5E7EB')
    .stroke();
  y += 16;

  const student = reportData?.student || {};
  const term = reportData?.term || {};
  doc.font('Helvetica-Bold').fontSize(11).text('Student Information', startX, y);
  y += 16;
  doc.font('Helvetica').fontSize(10);
  doc.text(`Full Name: ${toText(student.fullName)}`, startX, y);
  doc.text(`Student ID: ${toText(student.userId || student.studentId)}`, startX + 260, y);
  y += 14;
  doc.text(`Class: ${toText(student.className)}`, startX, y);
  doc.text(`Academic Year: ${toText(student.academicYear)}`, startX + 260, y);
  y += 14;
  doc.text(`Term/Semester: ${toText(term.label)}`, startX, y);
  y += 22;

  doc.font('Helvetica-Bold').fontSize(11).text('Subject Performance', startX, y);
  y += 18;

  const widths = {
    subject: Math.floor(pageWidth * 0.44),
    score: Math.floor(pageWidth * 0.16),
    grade: Math.floor(pageWidth * 0.14),
    remarks: Math.floor(pageWidth * 0.26),
  };

  drawTableHeader(doc, startX, y, widths);
  y += 22;

  const rows = Array.isArray(reportData?.subjects) ? reportData.subjects : [];
  doc.font('Helvetica').fontSize(10);
  for (const row of rows) {
    const score = toNumber(row.score, toNumber(row.averageScore, 0));
    if (y > 700) {
      doc.addPage();
      y = 50;
      drawTableHeader(doc, startX, y, widths);
      y += 22;
      doc.font('Helvetica').fontSize(10);
    }

    doc.text(toText(row.subjectName), startX, y, { width: widths.subject });
    doc.text(score.toFixed(2), startX + widths.subject, y, { width: widths.score, align: 'right' });
    doc.text(toText(row.letterGrade, gradeFromScore(score)), startX + widths.subject + widths.score, y, {
      width: widths.grade,
      align: 'center',
    });
    doc.text(toText(row.remarks, remarkFromScore(score)), startX + widths.subject + widths.score + widths.grade, y, {
      width: widths.remarks,
      align: 'left',
    });
    y += 18;
  }

  y += 8;
  doc
    .moveTo(startX, y)
    .lineTo(startX + pageWidth, y)
    .strokeColor('#E5E7EB')
    .stroke();
  y += 16;

  const summary = reportData?.summary || {};
  doc.font('Helvetica-Bold').fontSize(11).text('Summary', startX, y);
  y += 16;
  doc.font('Helvetica').fontSize(10);
  doc.text(`Total Score: ${toNumber(summary.totalScore, 0).toFixed(2)}`, startX + 320, y, {
    width: 170,
    align: 'right',
  });
  y += 14;
  doc.text(`Average Score: ${toNumber(summary.averageScore, 0).toFixed(2)}`, startX + 320, y, {
    width: 170,
    align: 'right',
  });
  if (summary.rank !== null && summary.rank !== undefined) {
    y += 14;
    doc.text(`Rank: ${summary.rank}`, startX + 320, y, { width: 170, align: 'right' });
  }

  y += 26;
  doc.font('Helvetica-Bold').text("Teacher's Remark", startX, y);
  y += 16;
  doc.font('Helvetica').text(
    toText(reportData?.teacherRemark, 'Consistent effort shown. Keep improving in weaker subjects.'),
    startX,
    y,
    { width: pageWidth }
  );

  y += 50;
  const sigY = Math.min(y, 740);
  doc
    .moveTo(startX + 20, sigY)
    .lineTo(startX + 200, sigY)
    .strokeColor('#374151')
    .stroke();
  doc
    .moveTo(startX + 300, sigY)
    .lineTo(startX + 480, sigY)
    .strokeColor('#374151')
    .stroke();
  doc.font('Helvetica').fontSize(10).text('Class Teacher', startX + 70, sigY + 6);
  doc.text('Principal', startX + 370, sigY + 6);

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#6B7280')
    .text(`Generated by Intelli Campus • ${formatDate(new Date())}`, startX, 790, {
      width: pageWidth,
      align: 'center',
    });

  doc.end();
}

module.exports = { generateReportCardPDF };
