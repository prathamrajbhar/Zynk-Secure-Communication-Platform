import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AIService } from '../services/aiService';
import prisma from '../db/client';
import { z } from 'zod';

const router = Router();

// Translate message
router.post('/translate', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      text: z.string().min(1).max(10000),
      targetLang: z.string().min(2).max(10)
    });

    const { text, targetLang } = schema.parse(req.body);
    
    const translated = await AIService.translateMessage(text, targetLang);
    res.json({ success: true, data: { translated } });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid input' });
    } else {
      res.status(500).json({ success: false, error: 'Translation failed' });
    }
  }
});

// Detect spam/moderate content
router.post('/moderate', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      message: z.string().min(1).max(10000)
    });

    const { message } = schema.parse(req.body);
    
    const result = await AIService.moderateContent(message);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid input' });
    } else {
      res.status(500).json({ success: false });
    }
  }
});

// Generate smart replies
router.post('/smart-replies', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      conversationHistory: z.array(z.string()).min(1).max(50)
    });

    const { conversationHistory } = schema.parse(req.body);
    
    const replies = await AIService.generateSmartReplies(conversationHistory);
    res.json({ success: true, data: { replies } });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid input' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to generate replies' });
    }
  }
});

// Complete message
router.post('/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      partialMessage: z.string().min(1).max(500),
      context: z.string().optional()
    });

    const { partialMessage, context } = schema.parse(req.body);
    
    const completion = await AIService.completeMessage(partialMessage, context);
    res.json({ success: true, data: { completion } });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid input' });
    } else {
      res.status(500).json({ success: false, error: 'Completion failed' });
    }
  }
});

// Summarize conversation
router.post('/summarize/:conversationId', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = (req as any).user.userId;

    // Verify user is part of conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { user_id: userId }
        }
      }
    });

    if (!conversation) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Fetch recent messages
    const messages = await prisma.messages.findMany({
      where: { conversation_id: conversationId },
      take: 50,
      orderBy: { created_at: 'desc' },
      include: { 
        sender: { 
          select: { username: true } 
        } 
      }
    });

    if (messages.length === 0) {
      return res.json({ success: true, data: { summary: 'No messages to summarize.' } });
    }

    // Note: In production, you'd decrypt messages first
    // For now, we'll work with the data we have
    const summary = await AIService.summarizeConversation(
      messages.map((m: any) => ({
        sender: m.sender.username,
        content: 'Message content' // In production: decrypt first
      }))
    );

    res.json({ success: true, data: { summary } });
  } catch (error) {
    console.error('Summarize error:', error);
    res.status(500).json({ success: false, error: 'Summarization failed' });
  }
});

// Analyze sentiment
router.post('/sentiment', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      message: z.string().min(1).max(10000)
    });

    const { message } = schema.parse(req.body);
    
    const sentiment = await AIService.analyzeSentiment(message);
    res.json({ success: true, data: sentiment });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid input' });
    } else {
      res.status(500).json({ success: false, error: 'Analysis failed' });
    }
  }
});

// Enhanced search
router.post('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      query: z.string().min(1).max(200),
      conversationId: z.string()
    });

    const { query, conversationId } = schema.parse(req.body);
    const userId = (req as any).user.userId;

    // Verify access
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { user_id: userId }
        }
      }
    });

    if (!conversation) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Fetch messages (in production, you'd decrypt first)
    const messages = await prisma.messages.findMany({
      where: { conversation_id: conversationId },
      take: 100,
      orderBy: { created_at: 'desc' }
    });

    const messagePool = messages.map((m: any) => ({
      content: 'Message content', // In production: decrypt
      timestamp: m.created_at
    }));

    const results = await AIService.enhancedSearch(query, messagePool);
    
    res.json({ success: true, data: { results } });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid input' });
    } else {
      res.status(500).json({ success: false, error: 'Search failed' });
    }
  }
});

export default router;
