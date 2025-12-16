import { Router, Request, Response } from 'express';
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

router.post(
  '/message',
  asyncHandler(async (req: Request, res: Response) => {
    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== 'string') {
      res.status(400).json({ success: false, error: 'Message is required' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        success: false,
        error: 'API key not configured',
      });
      return;
    }

    type ChatHistoryEntry = {
      role: 'assistant' | 'user';
      content: string;
    };

    const sanitizedHistory: ChatHistoryEntry[] = Array.isArray(history)
      ? history
          .filter(
            (entry): entry is ChatHistoryEntry =>
              entry &&
              typeof entry === 'object' &&
              (entry.role === 'assistant' || entry.role === 'user') &&
              typeof entry.content === 'string' &&
              entry.content.trim().length > 0
          )
          .slice(-4)
      : [];

    let prompt = `${SYSTEM_PROMPT}\n\n`;

    if (sanitizedHistory.length) {
      prompt += 'Previous conversation:\n';
      for (const entry of sanitizedHistory) {
        const speaker = entry.role === 'user' ? 'User' : 'Badda';
        prompt += `${speaker}: ${entry.content.trim()}\n`;
      }
      prompt += '\n';
    }

    prompt += `User: ${message.trim()}\nBadda:`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let reply = "I'm here to help! Could you please rephrase your question?";

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 500,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Gemini API error:', data);
        throw new Error(data.error?.message || 'Gemini API request failed');
      }

      const candidateText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || reply;
      reply = candidateText.trim() || reply;
    } catch (apiError) {
      console.error('Chat Error:', apiError);
      res.status(502).json({
        success: false,
        error: 'AI service temporarily unavailable. Please try again shortly.',
        details: (apiError as Error).message,
      });
      return;
    }

    res.json({
      success: true,
      reply,
      message: reply,
    });
  })
);

export default router;
