const { generateReportCardPDF } = require('../services/reportCardPdf.service');
const { buildReportCardData } = require('../services/reportCardData.service');

const downloadReportCard = async (req, res) => {
  try {
    const result = await buildReportCardData({
      studentId: req.params.studentId,
      termId: req.params.termId,
      schoolId: req.user.schoolId,
      requestedAcademicYear: req.query.academicYear,
    });
    if (result.error) {
      return res.status(result.error.status).json({ success: false, error: result.error.message });
    }

    await generateReportCardPDF(res, result.data);
    return null;
  } catch (error) {
    console.error('Download report card error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate report card PDF.',
    });
  }
};

const previewReportCard = async (req, res) => {
  try {
    const result = await buildReportCardData({
      studentId: req.params.studentId,
      termId: req.params.termId,
      schoolId: req.user.schoolId,
      requestedAcademicYear: req.query.academicYear,
    });
    if (result.error) {
      return res.status(result.error.status).json({ success: false, error: result.error.message });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('Preview report card error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to preview report card.',
    });
  }
};

module.exports = { downloadReportCard, previewReportCard };
