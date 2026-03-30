// src/ai/utils/promptTemplates.js

const promptTemplates = {
  /**
   * AI Tutor prompt for academic questions
   */
  tutorPrompt: (question, subject, language = 'English') => {
    const languageInstruction = language === 'Amharic' 
      ? 'Please respond in Amharic (አማርኛ).' 
      : 'Please respond in English.';

    return `You are an expert tutor for Ethiopian high school students. ${languageInstruction}

SUBJECT: ${subject || 'General'}
STUDENT QUESTION: ${question}

Please provide:
1. A clear, step-by-step explanation
2. Examples where relevant
3. Encourage the student to practice
4. Use simple language appropriate for high school level

Be supportive, patient, and educational.`;
  },

  /**
   * Homework generation prompt
   */
  homeworkPrompt: (subject, topic, gradeLevel, difficulty, numQuestions) => {
    return `Generate ${numQuestions} homework questions for Ethiopian students.

SUBJECT: ${subject}
TOPIC: ${topic}
GRADE LEVEL: ${gradeLevel}
DIFFICULTY: ${difficulty}

Generate questions in the following JSON format:
{
  "questions": [
    {
      "questionNumber": 1,
      "question": "Question text here",
      "type": "multiple-choice" or "short-answer" or "essay" or "problem-solving",
      "points": 5,
      "options": [{"label":"A","text":"Option 1"},{"label":"B","text":"Option 2"},{"label":"C","text":"Option 3"},{"label":"D","text":"Option 4"}] // for multiple-choice only
    }
  ],
  "answerKey": [
    {
      "questionNumber": 1,
      "correctAnswer": "Answer here",
      "explanation": "Brief explanation"
    }
  ]
}

Requirements:
- Mix question types (70% multiple-choice, 20% short-answer, 10% problem-solving)
- Questions should test understanding, not just memorization
- Include diagrams or examples where needed (describe them textually)
- For ${difficulty} level, adjust complexity accordingly
- Ensure questions align with Ethiopian curriculum standards
- IMPORTANT: Do not include raw newline characters inside JSON strings. If you need a newline, use \\n.

Do NOT wrap the JSON in markdown code fences (no triple-backticks).
Return ONLY the JSON, no additional text.`;
  },

  /**
   * Homework questions only (smaller, more reliable JSON)
   */
  homeworkQuestionsPrompt: (subject, topic, gradeLevel, difficulty, numQuestions) => {
    return `Generate ${numQuestions} homework questions for Ethiopian students.

SUBJECT: ${subject}
TOPIC: ${topic}
GRADE LEVEL: ${gradeLevel}
DIFFICULTY: ${difficulty}

Return JSON in this exact shape:
{
  "questions": [
    {
      "questionNumber": 1,
      "question": "Question text here",
      "type": "multiple-choice" | "short-answer" | "essay" | "problem-solving",
      "points": 5,
      "options": [{"label":"A","text":"Option 1"},{"label":"B","text":"Option 2"},{"label":"C","text":"Option 3"},{"label":"D","text":"Option 4"}]
    }
  ]
}

Rules:
- Mix question types (70% multiple-choice, 20% short-answer, 10% problem-solving)
- Only include "options" for multiple-choice questions; omit it for other types
- Do not include raw newline characters inside JSON strings; use \\n if needed
- Do NOT wrap the JSON in markdown code fences (no triple-backticks)

Return ONLY the JSON.`;
  },

  /**
   * Homework answer key only, based on generated questions
   */
  homeworkAnswerKeyPrompt: (questions) => {
    return `Create an answer key for the following homework questions.

QUESTIONS JSON:
${JSON.stringify(questions, null, 2)}

Return JSON in this exact shape:
{
  "answerKey": [
    {
      "questionNumber": 1,
      "correctAnswer": "Answer here",
      "explanation": "Brief explanation"
    }
  ]
}

Rules:
- Provide an entry for every questionNumber
- Keep explanations short (1-2 sentences)
- Do not include raw newline characters inside JSON strings; use \\n if needed
- Do NOT wrap the JSON in markdown code fences (no triple-backticks)

Return ONLY the JSON.`;
  },

  /**
   * Student performance analysis prompt
   */
  performanceAnalysisPrompt: (studentData) => {
    return `Analyze this student's academic performance and provide insights.

STUDENT DATA:
${JSON.stringify(studentData, null, 2)}

Provide analysis in JSON format:
{
  "overallPerformance": "excellent/good/average/poor",
  "strengths": ["subject1", "subject2"],
  "weaknesses": ["subject3"],
  "atRisk": true/false,
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2"
  ],
  "trendAnalysis": "Improving/Stable/Declining",
  "focusAreas": ["Topic 1", "Topic 2"]
}

Do NOT wrap the JSON in markdown code fences (no triple-backticks).
Return ONLY the JSON.`;
  },

  /**
   * Attendance trend analysis prompt
   */
  attendanceTrendPrompt: (attendanceData) => {
    return `Analyze student attendance patterns and provide insights.

ATTENDANCE DATA:
${JSON.stringify(attendanceData, null, 2)}

Provide analysis in JSON format:
{
  "attendanceRate": 85.5,
  "trend": "Improving/Stable/Declining",
  "concerns": [
    "High absence rate in the past month",
    "Frequent late arrivals"
  ],
  "patterns": {
    "mostAbsentDay": "Monday",
    "mostAbsentMonth": "February"
  },
  "recommendations": [
    "Schedule parent meeting",
    "Monitor health issues"
  ],
  "riskLevel": "low/medium/high"
}

Do NOT wrap the JSON in markdown code fences (no triple-backticks).
Return ONLY the JSON.`;
  },

  /**
   * Class performance comparison prompt
   */
  classComparisonPrompt: (classData) => {
    return `Compare performance across students in this class.

CLASS DATA:
${JSON.stringify(classData, null, 2)}

Provide analysis in JSON format:
{
  "classAverage": 75.5,
  "topPerformers": [
    {"studentId": 1, "name": "Student A", "average": 92.5}
  ],
  "strugglingStudents": [
    {"studentId": 5, "name": "Student E", "average": 45.0}
  ],
  "subjectAnalysis": {
    "strengths": ["Mathematics", "Science"],
    "weaknesses": ["English", "History"]
  },
  "recommendations": [
    "Provide extra support for English",
    "Recognize top performers"
  ]
}

Do NOT wrap the JSON in markdown code fences (no triple-backticks).
Return ONLY the JSON.`;
  },
};

module.exports = promptTemplates;
