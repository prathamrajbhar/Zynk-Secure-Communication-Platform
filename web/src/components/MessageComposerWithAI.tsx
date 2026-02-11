'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { debounce } from '@/lib/utils';

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
}

export function MessageComposerWithAI({ 
  value, 
  onChange, 
  onSend, 
  placeholder = 'Type a message...' 
}: MessageComposerProps) {
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [showSuggestion, setShowSuggestion] = useState(false);

  // Debounced auto-complete
  const fetchSuggestion = useCallback(
    debounce(async (text: string) => {
      if (text.length < 10 || text.length > 100) {
        setAiSuggestion('');
        return;
      }

      try {
        const response = await api.post('/ai/complete', {
          partialMessage: text
        });

        if (response.data.success) {
          setAiSuggestion(response.data.data.completion);
          setShowSuggestion(true);
        }
      } catch (error) {
        console.error('Auto-complete failed:', error);
      }
    }, 1000),
    []
  );

  useEffect(() => {
    fetchSuggestion(value);
  }, [value, fetchSuggestion]);

  const acceptSuggestion = () => {
    onChange(value + ' ' + aiSuggestion);
    setAiSuggestion('');
    setShowSuggestion(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && aiSuggestion) {
      e.preventDefault();
      acceptSuggestion();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
        rows={3}
      />
      
      {showSuggestion && aiSuggestion && (
        <div className="absolute bottom-full left-0 right-0 mb-2 p-3 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                ✨ AI Suggestion (Press Tab to accept):
              </div>
              <div className="text-sm">
                {value} <span className="text-blue-600 dark:text-blue-400">{aiSuggestion}</span>
              </div>
            </div>
            <button
              onClick={acceptSuggestion}
              className="ml-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Accept
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
