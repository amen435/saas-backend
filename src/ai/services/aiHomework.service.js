// src/ai/services/aiHomework.service.js

const prisma = require('../../config/database');
const geminiService = require('./gemini.service');
const {
  homeworkPrompt,
  homeworkQuestionsPrompt,
  homeworkAnswerKeyPrompt,
} = require('../utils/promptTemplates');

class AiHomeworkService {
  normalizeQuestions(questions, startNumber = 1) {
    if (!Array.isArray(questions)) return [];

    return questions.map((q, index) => ({
      ...q,
      questionNumber: startNumber + index,
    }));
  }

  normalizeAnswerKey(answerKey, questions, startNumber = 1) {
    if (!Array.isArray(answerKey)) return [];
    const questionNumbers = new Set((questions || []).map((q) => q.questionNumber));
    const offset = Math.max(0, startNumber - 1);

    return answerKey
      .filter((a) => a && typeof a.questionNumber === 'number' && questionNumbers.has(a.questionNumber + offset))
      .map((a) => ({
        ...a,
        questionNumber: a.questionNumber + offset,
      }));
  }

  /**
   * Generate homework using AI
   */
  async generateHomework(teacherId, schoolId, data) {
    if (!geminiService.isAvailable()) {
      throw new Error('AI service is not available');
    }

    const {
      subject,
      topic,
      gradeLevel,
      difficulty,
      numberOfQuestions,
      classId,
      subjectId,
      instructions,
    } = data;

    // Verify teacher belongs to school
    const teacher = await prisma.teacher.findFirst({
      where: { teacherId, schoolId },
    });

    if (!teacher) {
      throw new Error('Teacher not found in this school');
    }

    const requestedQuestions = numberOfQuestions || 5;
    const useSingleCall = String(process.env.AI_HOMEWORK_SINGLE_CALL ?? 'true').toLowerCase() === 'true';
    const maxTokens = parseInt(process.env.AI_HOMEWORK_MAX_TOKENS || process.env.AI_MAX_TOKENS || '1024') || 1024;

    // When using a single-call prompt, generate a larger chunk per Gemini request
    // to reduce quota usage (but cap output size for safety).
    const batchSizeDefault = useSingleCall ? Math.min(requestedQuestions, 10) : 5;
    const batchSizeFromEnv = Number.parseInt(process.env.AI_HOMEWORK_BATCH_SIZE || '');
    const batchSize = Math.max(1, Number.isFinite(batchSizeFromEnv) ? batchSizeFromEnv : batchSizeDefault);

    const allQuestions = [];
    const allAnswerKey = [];

    let nextQuestionNumber = 1;
    for (let generated = 0; generated < requestedQuestions; generated += batchSize) {
      const count = Math.min(batchSize, requestedQuestions - generated);

      if (useSingleCall) {
        // Single call: generate both questions + answerKey to reduce Gemini quota usage.
        const singleCallPrompt = homeworkPrompt(subject, topic, gradeLevel, difficulty, count);
        const result = await geminiService.generateJSON(singleCallPrompt, null, {
          temperature: 0.2,
          maxTokens,
        });

        const batchQuestionsRaw = Array.isArray(result?.data?.questions) ? result.data.questions : [];
        const batchAnswerKeyRaw = Array.isArray(result?.data?.answerKey) ? result.data.answerKey : [];

        const batchQuestions = this.normalizeQuestions(batchQuestionsRaw, nextQuestionNumber);
        if (batchQuestions.length === 0) throw new Error('AI returned no questions');

        const batchAnswerKey = this.normalizeAnswerKey(batchAnswerKeyRaw, batchQuestions, nextQuestionNumber);

        allQuestions.push(...batchQuestions);
        allAnswerKey.push(...batchAnswerKey);
        nextQuestionNumber += batchQuestions.length;
      } else {
        // Fallback (more reliable JSON, more API calls):
        const questionsPrompt = homeworkQuestionsPrompt(
          subject,
          topic,
          gradeLevel,
          difficulty,
          count
        );

        const questionsResult = await geminiService.generateJSON(questionsPrompt, null, {
          temperature: 0.2,
          maxTokens,
        });

        const batchQuestionsRaw = Array.isArray(questionsResult?.data?.questions)
          ? questionsResult.data.questions
          : [];

        const batchQuestions = this.normalizeQuestions(batchQuestionsRaw, nextQuestionNumber);
        if (batchQuestions.length === 0) {
          throw new Error('AI returned no questions');
        }

        const answerKeyPrompt = homeworkAnswerKeyPrompt(batchQuestions);
        const answerKeyResult = await geminiService.generateJSON(answerKeyPrompt, null, {
          temperature: 0,
          maxTokens,
        });

        const answerKeyRaw = Array.isArray(answerKeyResult?.data?.answerKey)
          ? answerKeyResult.data.answerKey
          : [];

        const batchAnswerKey = this.normalizeAnswerKey(answerKeyRaw, batchQuestions, nextQuestionNumber);

        allQuestions.push(...batchQuestions);
        allAnswerKey.push(...batchAnswerKey);
        nextQuestionNumber += batchQuestions.length;
      }
    }

    const questions = allQuestions;
    const answerKey = allAnswerKey;

    // Save to database
    const homework = await prisma.aiHomework.create({
      data: {
        teacherId,
        schoolId,
        classId: classId || null,
        subjectId: subjectId || null,
        topic,
        subjectName: subject || null,
        gradeLevel,
        difficulty,
        numberOfQuestions: requestedQuestions,
        generatedQuestions: questions,
        answerKey: answerKey.length > 0 ? answerKey : [],
        instructions: instructions || null,
        isPublished: false,
      },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                fullName: true,
              },
            },
          },
        },
        class: {
          select: {
            className: true,
          },
        },
        subject: {
          select: {
            subjectName: true,
          },
        },
      },
    });

    return homework;
  }

  /**
   * Get all homework for a teacher
   */
  async getTeacherHomework(teacherId, schoolId, filters = {}) {
    const where = {
      teacherId,
      schoolId,
    };

    if (filters.subject) {
      where.subjectName = { contains: filters.subject };
    }

    if (filters.difficulty) {
      where.difficulty = filters.difficulty;
    }

    if (filters.classId) {
      where.classId = parseInt(filters.classId);
    }

    if (filters.isPublished !== undefined) {
      where.isPublished = filters.isPublished === 'true';
    }

    const homework = await prisma.aiHomework.findMany({
      where,
      include: {
        class: {
          select: {
            className: true,
          },
        },
        subject: {
          select: {
            subjectName: true,
          },
        },
        submissions: {
          where: { status: 'SUBMITTED' },
          select: { studentId: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return homework;
  }

  /**
   * Get specific homework
   */
  async getHomeworkById(homeworkId, teacherId, schoolId) {
    const homework = await prisma.aiHomework.findFirst({
      where: {
        homeworkId,
        teacherId,
        schoolId,
      },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                fullName: true,
              },
            },
          },
        },
        class: {
          select: {
            className: true,
          },
        },
        subject: {
          select: {
            subjectName: true,
          },
        },
      },
    });

    if (!homework) {
      throw new Error('Homework not found');
    }

    return homework;
  }

  /**
   * Update homework
   */
  async updateHomework(homeworkId, teacherId, schoolId, data) {
    const homework = await prisma.aiHomework.findFirst({
      where: {
        homeworkId,
        teacherId,
        schoolId,
      },
    });

    if (!homework) {
      throw new Error('Homework not found');
    }

    const updated = await prisma.aiHomework.update({
      where: { homeworkId },
      data: {
        topic: data.topic !== undefined ? data.topic : homework.topic,
        instructions: data.instructions !== undefined ? data.instructions : homework.instructions,
        isPublished: data.isPublished !== undefined ? data.isPublished : homework.isPublished,
        generatedQuestions:
          data.generatedQuestions !== undefined ? data.generatedQuestions : homework.generatedQuestions,
        answerKey: data.answerKey !== undefined ? data.answerKey : homework.answerKey,
      },
    });

    return updated;
  }

  /**
   * Publish homework
   */
  async publishHomework(homeworkId, teacherId, schoolId) {
    return this.updateHomework(homeworkId, teacherId, schoolId, { isPublished: true });
  }

  /**
   * Delete homework
   */
  async deleteHomework(homeworkId, teacherId, schoolId) {
    const homework = await prisma.aiHomework.findFirst({
      where: {
        homeworkId,
        teacherId,
        schoolId,
      },
    });

    if (!homework) {
      throw new Error('Homework not found');
    }

    await prisma.aiHomework.delete({
      where: { homeworkId },
    });

    return homework;
  }

  /**
   * Regenerate specific questions
   */
  async regenerateQuestions(homeworkId, teacherId, schoolId, questionNumbers) {
    const homework = await this.getHomeworkById(homeworkId, teacherId, schoolId);

    // Generate new questions
    const questionsPrompt = homeworkQuestionsPrompt(
      homework.subject,
      homework.topic,
      homework.gradeLevel,
      homework.difficulty,
      questionNumbers.length
    );

    const questionsResult = await geminiService.generateJSON(questionsPrompt, null, { temperature: 0.2 });
    const newQuestionsRaw = Array.isArray(questionsResult?.data?.questions)
      ? questionsResult.data.questions
      : [];

    if (newQuestionsRaw.length === 0) {
      throw new Error('AI returned no questions');
    }

    // Generate answer key for the new questions
    const answerKeyPrompt = homeworkAnswerKeyPrompt(newQuestionsRaw);
    const answerKeyResult = await geminiService.generateJSON(answerKeyPrompt, null, { temperature: 0 });
    const newAnswerKeyRaw = Array.isArray(answerKeyResult?.data?.answerKey)
      ? answerKeyResult.data.answerKey
      : [];

    // Replace specified questions
    const updatedQuestions = [...homework.generatedQuestions];
    const updatedAnswers = [...homework.answerKey];

    questionNumbers.forEach((qNum, index) => {
      const qIndex = qNum - 1;
      if (newQuestionsRaw[index]) {
        updatedQuestions[qIndex] = { ...newQuestionsRaw[index], questionNumber: qNum };
      }
      if (newAnswerKeyRaw[index]) {
        updatedAnswers[qIndex] = { ...newAnswerKeyRaw[index], questionNumber: qNum };
      }
    });

    return this.updateHomework(homeworkId, teacherId, schoolId, {
      generatedQuestions: updatedQuestions,
      answerKey: updatedAnswers,
    });
  }
}

module.exports = new AiHomeworkService();
