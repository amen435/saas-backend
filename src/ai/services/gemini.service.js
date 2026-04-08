// src/ai/services/gemini.service.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

const normalizeModelName = (name) => {
  const value = String(name || '').trim();
  if (!value) return '';
  // If AI_MODEL is copied from the REST "ListModels" endpoint (e.g. "models/gemini-2.5-flash"),
  // the Node SDK expects the short id (e.g. "gemini-2.5-flash").
  return value.startsWith('models/') ? value.slice('models/'.length) : value;
};

class GeminiService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('⚠️  GEMINI_API_KEY not found. AI features will be disabled.');
      this.genAI = null;
      return;
    }

    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.modelName = normalizeModelName(process.env.AI_MODEL) || 'gemini-2.5-flash';
    this.model = this.genAI.getGenerativeModel({
      model: this.modelName,
    });
  }

  /**
   * Generate content from text prompt
   */
  async generateContent(prompt, options = {}) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured. Please add GEMINI_API_KEY to .env');
    }

    const quotaRetried = options?._quotaRetried === true;

    try {
      const generationConfig = {
        temperature: options.temperature || parseFloat(process.env.AI_TEMPERATURE) || 0.7,
        maxOutputTokens: options.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 2048,
        topP: options.topP || 0.95,
        topK: options.topK || 40,
        ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
      };

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      });

      const response = result.response;
      const text = response.text();

      return {
        text,
        tokens: this.estimateTokens(prompt + text),
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      
      if (error?.message?.includes('API key')) {
        throw new Error('Invalid Gemini API key');
      }
      
      // Gemini quota/rate-limit failures often show up as HTTP 429 or phrases like:
      // "quota exceeded", "RESOURCE_EXHAUSTED", "throttled", etc.
      const msg = String(error?.message || '').toLowerCase();
      const status = error?.status || error?.statusCode;

      const retryDelay =
        Array.isArray(error?.errorDetails)
          ? error.errorDetails.find((d) => String(d?.['@type'] || '').toLowerCase().includes('retryinfo'))?.retryDelay
          : undefined;

      const retryDelayFromMessage = (() => {
        const m = String(error?.message || '').match(/retry in\s*([\d.]+)s/i);
        return m ? `${m[1]}s` : undefined;
      })();

      const isQuotaOrRateLimit =
        status === 429 ||
        msg.includes('quota') ||
        msg.includes('resource_exhausted') ||
        msg.includes('resource exhausted') ||
        msg.includes('throttl') ||
        msg.includes('rate limit') ||
        msg.includes('exhausted');

      if (isQuotaOrRateLimit) {
        const finalDelay = retryDelay || retryDelayFromMessage;
        if (status === 429 && finalDelay && !quotaRetried) {
          const retrySeconds = parseFloat(String(finalDelay).replace(/[^0-9.]/g, ''));
          const maxRetryMs = parseInt(process.env.AI_QUOTA_RETRY_MAX_MS || '45000');
          const waitMs = Math.min(Math.max(0, retrySeconds * 1000), maxRetryMs);

          if (process.env.AI_QUOTA_RETRY_ONCE !== 'false' && waitMs > 0) {
            console.warn(`Gemini 429: waiting ${waitMs}ms then retrying once...`);
            await new Promise((r) => setTimeout(r, waitMs));
            return this.generateContent(prompt, { ...options, _quotaRetried: true });
          }
        }

        if (finalDelay) {
          throw new Error(`API quota exceeded. Please try again after ${finalDelay}.`);
        }
        throw new Error('API quota exceeded or rate limited. Please try again later.');
      }

      if (status === 503) {
        throw new Error('AI service is temporarily unavailable. Please retry shortly.');
      }

      if (error?.status === 404 || error.message?.includes('is not found for API version')) {
        throw new Error(
          `Gemini model "${this.modelName}" not found or doesn't support generateContent. ` +
            `Set AI_MODEL in .env to a supported model (use the Google "ListModels" endpoint to see what's available).`
        );
      }

      throw new Error('Failed to generate AI response');
    }
  }

  /**
   * Generate structured JSON output
   */
  extractJsonText(rawText) {
    let jsonText = (rawText || '').trim();

    // Remove a leading fenced marker even if the closing fence is missing (common on truncation).
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```[^\r\n]*[\r\n]+/, '').trim();
      jsonText = jsonText.replace(/```$/i, '').trim();
    }

    // Extract JSON from markdown code blocks (```json ... ``` or ``` ... ```), tolerant of \r\n and extra whitespace.
    const fencedMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      jsonText = fencedMatch[1].trim();
    }

    // If the model still returned extra text, try to grab the first JSON object/array payload.
    const firstObject = jsonText.indexOf('{');
    const firstArray = jsonText.indexOf('[');
    const start =
      firstObject === -1 ? firstArray : firstArray === -1 ? firstObject : Math.min(firstObject, firstArray);

    if (start > 0) {
      const lastObject = jsonText.lastIndexOf('}');
      const lastArray = jsonText.lastIndexOf(']');
      const end = Math.max(lastObject, lastArray);
      if (end > start) {
        jsonText = jsonText.slice(start, end + 1).trim();
      } else {
        jsonText = jsonText.slice(start).trim();
      }
    }

    // Common JSON issues from LLMs: trailing commas and stray control characters.
    return jsonText
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u0000-\u001F\u007F]/g, (ch) => (ch === '\n' || ch === '\r' || ch === '\t' ? ch : ''));
  }

  parseJsonWithTruncation(jsonText) {
    let working = (jsonText || '').trim();

    // Try parsing; if it fails, iteratively truncate to the last likely end-bracket to salvage valid JSON.
    let parsed;
    let lastError;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        parsed = JSON.parse(working);
        break;
      } catch (e) {
        lastError = e;
        const lastObject = working.lastIndexOf('}');
        const lastArray = working.lastIndexOf(']');
        const end = Math.max(lastObject, lastArray);
        if (end <= 0) break;
        working = working.slice(0, end + 1).trim();
      }
    }

    if (parsed === undefined) {
      throw lastError || new Error('JSON parse failed');
    }

    return parsed;
  }

  async generateJSON(prompt, schema = null, options = {}) {
    const result = await this.generateContent(prompt, {
      responseMimeType: 'application/json',
      temperature: 0.2,
      ...options,
    });
    
    try {
      const jsonText = this.extractJsonText(result.text);
      const parsed = this.parseJsonWithTruncation(jsonText);
      
      return {
        data: parsed,
        tokens: result.tokens,
      };
    } catch (error) {
      // One retry: ask the model to repair its own output into valid JSON.
      try {
        console.warn('JSON parse failed; attempting AI repair...');
        const raw = (result.text || '').slice(0, 8000);
        const repairPrompt =
          'Fix the following output into valid JSON. ' +
          'Rules: return ONLY JSON; do not use markdown; do not add commentary; ' +
          'ensure all strings are properly quoted and do not contain raw newlines (use \\\\n if needed).\n\n' +
          raw;

        const repair = await this.generateContent(repairPrompt, {
          responseMimeType: 'application/json',
          temperature: 0,
        });

        const repairedText = this.extractJsonText(repair.text);
        const repaired = this.parseJsonWithTruncation(repairedText);

        return {
          data: repaired,
          tokens: result.tokens + (repair.tokens || 0),
        };
      } catch (repairError) {
        console.error('JSON parsing error:', error);
        console.error('Raw AI response (first 500 chars):', (result.text || '').slice(0, 500));
        console.error('JSON repair error:', repairError);
        throw new Error('AI generated invalid JSON response');
      }
    }
  }

  /**
   * Chat with context
   */
  async chat(messages, options = {}) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured');
    }

    try {
      const chat = this.model.startChat({
        history: messages.slice(0, -1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })),
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens || 2048,
        },
      });

      const lastMessage = messages[messages.length - 1];
      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;

      return {
        text: response.text(),
        tokens: this.estimateTokens(response.text()),
      };
    } catch (error) {
      console.error('Gemini chat error:', error);

      if (error?.status === 404 || error.message?.includes('is not found for API version')) {
        throw new Error(
          `Gemini model "${this.modelName}" not found or doesn't support chat. ` +
            `Set AI_MODEL in .env to a supported model (use the Google "ListModels" endpoint to see what's available).`
        );
      }

      throw new Error('Failed to generate chat response');
    }
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if AI is available
   */
  isAvailable() {
    return this.genAI !== null;
  }
}

module.exports = new GeminiService();
