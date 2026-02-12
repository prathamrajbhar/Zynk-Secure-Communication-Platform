// ═══════════════════════════════════════════════════════
// ZYNK UI — New Chat Modal (HeroUI v7)
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import {
  Modal, ModalContent, ModalHeader, ModalBody,
  Input, Spinner, Avatar,
} from '@heroui/react';
import { Search, MessageCircle, UserPlus } from 'lucide-react';
import api from '@/lib/api';
import { showToast } from '@/components/ui';

interface UserResult {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export default function NewChatModal() {
  const { showNewChat, setShowNewChat } = useUIStore();
  const { startConversation, setActiveConversation } = useChatStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        setResults(res.data.users || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleStartChat = async (userId: string) => {
    setStarting(userId);
    try {
      const conversationId = await startConversation(userId);
      setActiveConversation(conversationId);
      setShowNewChat(false);
    } catch {
      showToast('error', 'Failed to start conversation');
    } finally {
      setStarting(null);
    }
  };

  return (
    <Modal isOpen={showNewChat} onOpenChange={(open) => setShowNewChat(open)} size="md" placement="center" scrollBehavior="inside"
      classNames={{ base: 'bg-content1 border border-divider', header: 'border-b border-divider', body: 'p-0' }}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">New Chat</h2>
            <p className="text-xs text-default-400 font-normal">Start a conversation</p>
          </div>
        </ModalHeader>
        <ModalBody>
          <div className="px-4 py-3 border-b border-divider">
            <Input
              value={query}
              onValueChange={search}
              placeholder="Search by username..."
              variant="flat"
              size="sm"
              radius="lg"
              startContent={<Search className="w-4 h-4 text-default-400" />}
              classNames={{ inputWrapper: 'bg-content2' }}
              autoFocus
              aria-label="Search users"
            />
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner color="primary" size="md" />
              </div>
            ) : results.length > 0 ? (
              <div className="py-1">
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleStartChat(u.id)}
                    disabled={starting === u.id}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-content2 transition-colors text-left"
                  >
                    <Avatar name={(u.display_name || u.username).slice(0, 2).toUpperCase()} src={u.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{u.display_name || u.username}</p>
                      <p className="text-xs text-default-400 truncate">@{u.username}</p>
                    </div>
                    {starting === u.id ? (
                      <Spinner size="sm" color="primary" />
                    ) : (
                      <UserPlus className="w-5 h-5 text-default-400" />
                    )}
                  </button>
                ))}
              </div>
            ) : query ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-8 h-8 text-default-300 mb-3" />
                <p className="text-sm text-default-400">No users found</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-8 h-8 text-default-300 mb-3" />
                <p className="text-sm text-default-400">Search for a user to start chatting</p>
              </div>
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
