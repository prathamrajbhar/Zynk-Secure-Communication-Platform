'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface SmartReplyPanelProps {
  conversationId: string;
  lastMessages: string[];
  onSelectReply: (reply: string) => void;
}

export function SmartReplyPanel({ conversationId, lastMessages, onSelectReply }: SmartReplyPanelProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadSuggestions() {
      if (lastMessages.length === 0) return;

      setLoading(true);
      try {
        const response = await api.post('/ai/smart-replies', {
          conversationHistory: lastMessages
        });

        if (response.data.success) {
          setSuggestions(response.data.data.replies);
        }
      } catch (error) {
        console.error('Failed to load smart replies:', error);
      } finally {
        setLoading(false);
      }
    }

    loadSuggestions();
  }, [lastMessages]);

  if (!suggestions.length && !loading) return null;

  return (
    <div className="flex gap-2 p-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      {loading ? (
        <div className="text-sm text-gray-500">Generating suggestions...</div>
      ) : (
        <>
          <div className="text-xs text-gray-500 flex items-center mr-2">
            ✨ Quick replies:
          </div>
          {suggestions.map((reply, idx) => (
            <button
              key={idx}
              onClick={() => onSelectReply(reply)}
              className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors"
            >
              {reply}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
