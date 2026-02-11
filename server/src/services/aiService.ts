import axios from 'axios';

const AI_ENDPOINT = 'https://openlmfallback-0adc8b183b77.herokuapp.com/api/chat';

interface AIResponse {
  success: boolean;
  timestamp: string;
  data: {
    response: string;
    provider: string;
    responseTime: number;
  };
}

export class AIService {
  private static async query(message: string): Promise<string> {
    try {
      const { data } = await axios.post<AIResponse>(AI_ENDPOINT, {
        message,
        systemPrompt: "You are a helpful AI assistant for a secure messaging platform.",
        temperature: 0.7,
        maxTokens: 500
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return data.data.response;
    } catch (error) {
      console.error('AI Service Error:', error);
      throw new Error('AI service unavailable');
    }
  }

  // Smart Reply Suggestions
  static async generateSmartReplies(
    conversationHistory: string[]
  ): Promise<string[]> {
    if (conversationHistory.length === 0) return [];
    
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const context = conversationHistory.slice(-5).join('\n');

    const prompt = `Given this conversation:
${context}

Suggest 3 short, natural reply options (max 10 words each) to: "${lastMessage}"

Format as:
1. [reply]
2. [reply]
3. [reply]`;

    try {
      const response = await this.query(prompt);
      
      // Parse the numbered list
      return response
        .split('\n')
        .filter(line => /^\d\./.test(line))
        .map(line => line.replace(/^\d\.\s*/, '').trim())
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  // Message Translation
  static async translateMessage(
    text: string,
    targetLang: string
  ): Promise<string> {
    const prompt = `Translate this to ${targetLang}, keep it natural and conversational:

"${text}"

Only respond with the translation, nothing else.`;

    return await this.query(prompt);
  }

  // Smart Compose (Auto-complete)
  static async completeMessage(
    partialMessage: string,
    context?: string
  ): Promise<string> {
    const prompt = context 
      ? `Continue this message naturally based on context:

Context: ${context}
Partial message: "${partialMessage}"

Complete it in 1-2 sentences:`
      : `Complete this message naturally: "${partialMessage}"`;

    return await this.query(prompt);
  }

  // Message Sentiment Analysis
  static async analyzeSentiment(
    message: string
  ): Promise<{ sentiment: 'positive' | 'negative' | 'neutral'; score: number }> {
    const prompt = `Analyze the sentiment of this message and respond ONLY with:
positive|0.X OR negative|0.X OR neutral|0.X

Message: "${message}"`;

    try {
      const response = await this.query(prompt);
      const [sentiment, scoreStr] = response.trim().toLowerCase().split('|');
      
      return {
        sentiment: (sentiment as 'positive' | 'negative' | 'neutral') || 'neutral',
        score: parseFloat(scoreStr) || 0.5
      };
    } catch {
      return { sentiment: 'neutral', score: 0.5 };
    }
  }

  // Spam Detection
  static async detectSpam(message: string): Promise<boolean> {
    const prompt = `Is this message spam/scam? Respond ONLY with: yes OR no

Message: "${message}"`;

    try {
      const response = await this.query(prompt);
      return response.trim().toLowerCase().includes('yes');
    } catch {
      return false;
    }
  }

  // Context-Aware Search
  static async enhancedSearch(
    query: string,
    messagePool: Array<{ content: string; timestamp: Date }>
  ): Promise<Array<{ content: string; relevance: number }>> {
    // First, do basic text matching
    const matches = messagePool.filter(msg => 
      msg.content.toLowerCase().includes(query.toLowerCase())
    );

    if (matches.length === 0 && messagePool.length > 0) {
      // Use AI for semantic search
      const prompt = `Given these messages, which ones are relevant to "${query}"?
Rate each 0-10 for relevance. Respond as: MESSAGE_INDEX:SCORE

Messages:
${messagePool.map((m, i) => `${i}. ${m.content.substring(0, 100)}`).join('\n')}`;

      try {
        const response = await this.query(prompt);
        const scores = new Map<number, number>();
        
        response.split('\n').forEach(line => {
          const match = line.match(/(\d+):(\d+)/);
          if (match) {
            scores.set(parseInt(match[1]), parseInt(match[2]));
          }
        });

        return messagePool
          .map((msg, idx) => ({
            content: msg.content,
            relevance: (scores.get(idx) || 0) / 10
          }))
          .filter(m => m.relevance > 0.3)
          .sort((a, b) => b.relevance - a.relevance);
      } catch {
        return [];
      }
    }

    return matches.map(m => ({ content: m.content, relevance: 1 }));
  }

  // Auto-Categorization
  static async categorizeConversation(
    messages: string[]
  ): Promise<'work' | 'personal' | 'shopping' | 'travel' | 'other'> {
    const sample = messages.slice(-10).join('\n');
    
    const prompt = `Categorize this conversation as ONE of: work, personal, shopping, travel, other

Messages:
${sample}

Respond ONLY with the category word.`;

    try {
      const response = await this.query(prompt);
      const category = response.trim().toLowerCase();
      
      if (['work', 'personal', 'shopping', 'travel'].includes(category)) {
        return category as any;
      }
      return 'other';
    } catch {
      return 'other';
    }
  }

  // Smart Summary for Long Conversations
  static async summarizeConversation(
    messages: Array<{ sender: string; content: string }>
  ): Promise<string> {
    const conversation = messages
      .slice(-50) // Last 50 messages
      .map(m => `${m.sender}: ${m.content}`)
      .join('\n');

    const prompt = `Summarize this conversation in 2-3 sentences:

${conversation}`;

    return await this.query(prompt);
  }

  // Voice Message Transcription Enhancement
  static async enhanceTranscript(
    rawTranscript: string
  ): Promise<string> {
    const prompt = `Clean up this voice message transcript (fix grammar, add punctuation):

Raw: "${rawTranscript}"

Respond ONLY with the cleaned transcript.`;

    return await this.query(prompt);
  }

  // Inappropriate Content Detection
  static async moderateContent(
    message: string
  ): Promise<{ safe: boolean; reason?: string }> {
    const prompt = `Is this message safe/appropriate? Check for: hate speech, harassment, explicit content, threats.

Message: "${message}"

Respond as: SAFE or UNSAFE|reason`;

    try {
      const response = await this.query(prompt);
      
      if (response.toUpperCase().includes('SAFE')) {
        return { safe: true };
      }
      
      const parts = response.split('|');
      const reason = parts[1]?.trim() || 'Inappropriate content';
      return { safe: false, reason };
    } catch {
      return { safe: true }; // Fail open for availability
    }
  }
}
