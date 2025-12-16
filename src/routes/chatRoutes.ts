import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const SYSTEM_PROMPT = `You are Badda, an AI assistant for Lotto Pro - a lottery inventory management system for retail stores.

Your knowledge base:
- Product: Lotto Pro helps store owners track scratch-off lottery tickets
- Price: $29.99/month with no contracts, cancel anytime
- Key Features:
  * Real-time ticket inventory tracking
  * Automatic daily sales reports
  * Multi-store management support
  * Mobile app - use any smartphone, no special hardware needed
  * Prevents $5,000-$7,000 annual losses from theft and mismanagement
  * Setup in just 5 minutes
  * 24/7 support available

- Free Trial: Available - no credit card required
- Target Users: Convenience store owners, gas stations, lottery retailers
- Benefits: Stop theft, track inventory, perfect daily reports, affordable

Personality:
- Friendly, helpful, and professional
- Concise but informative responses
- Always mention you can connect users to human support for complex issues
- Focus on helping potential customers understand the value
- If asked about features not in your knowledge base, offer to connect them with support

Keep responses conversational and under 3-4 sentences when possible.`;

type ChatHistoryEntry = {
  role: 'assistant' | 'user';
  content: string;
};

const MODEL_NAME = 'gemini-1.5-flash';

const getModel = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT,
  });
};

router.post(
  '/message',
  asyncHandler(async (req: Request, res: Response) => {
    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== 'string') {
      res.status(400).json({ success: false, error: 'Message is required' });
      return;
    }

    let parsedHistory: ChatHistoryEntry[] = [];
    if (Array.isArray(history)) {
      const sanitized: ChatHistoryEntry[] = [];
      for (const entry of history) {
        if (
          entry &&
          typeof entry === 'object' &&
          (entry.role === 'assistant' || entry.role === 'user') &&
          typeof entry.content === 'string' &&
          entry.content.trim().length > 0
        ) {
          sanitized.push({
            role: entry.role,
            content: entry.content.trim(),
          });
        }
      }
      parsedHistory = sanitized.slice(-10);
    }
    while (parsedHistory.length && parsedHistory[0].role !== 'user') {
      parsedHistory.shift();
    }

    let model;
    try {
      model = getModel();
    } catch (configError) {
      res.status(500).json({
        success: false,
        error: (configError as Error).message || 'Gemini is not configured',
      });
      return;
    }

    const chatHistory = parsedHistory.map((entry) => ({
      role: entry.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: entry.content }],
    }));

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 500,
      },
    });

    try {
      const response = await chat.sendMessage(message);
      const reply = response.response.text();

      res.json({
        success: true,
        reply,
        message: reply,
      });
    } catch (modelError) {
      console.error('Gemini chat error:', modelError);
      res.status(502).json({
        success: false,
        error: 'AI service temporarily unavailable. Please try again shortly.',
      });
    }
  })
);

export default router;
