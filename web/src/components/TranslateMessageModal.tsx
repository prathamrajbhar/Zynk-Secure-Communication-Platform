'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { Languages, Loader2 } from 'lucide-react';

interface TranslateMessageModalProps {
  message: string;
  isOpen: boolean;
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
];

export function TranslateMessageModal({ message, isOpen, onClose }: TranslateMessageModalProps) {
  const [targetLang, setTargetLang] = useState('es');
  const [translated, setTranslated] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTranslate = async () => {
    setLoading(true);
    try {
      const response = await api.post('/ai/translate', {
        text: message,
        targetLang
      });

      if (response.data.success) {
        setTranslated(response.data.data.translated);
      }
    } catch (error) {
      console.error('Translation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Languages className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Translate Message</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Original Message</label>
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              {message}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Target Language</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleTranslate}
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Translating...
              </>
            ) : (
              'Translate'
            )}
          </button>

          {translated && (
            <div>
              <label className="block text-sm font-medium mb-2">Translation</label>
              <div className="p-3 bg-blue-50 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700">
                {translated}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
