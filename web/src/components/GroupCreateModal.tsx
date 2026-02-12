// ═══════════════════════════════════════════════════════
// ZYNK UI — Group Create Modal (HeroUI v7)
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Button, Spinner, Avatar, Chip, Checkbox,
} from '@heroui/react';
import { Search, Users, Camera, ArrowRight, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { showToast } from '@/components/ui';

interface UserResult {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export default function GroupCreateModal() {
  const { showGroupCreate, setShowGroupCreate } = useUIStore();
  const { fetchConversations, setActiveConversation } = useChatStore();
  const [step, setStep] = useState<'members' | 'info'>('members');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
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

  const toggleUser = (user: UserResult) => {
    setSelected((prev) =>
      prev.find((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selected.length === 0) {
      showToast('error', 'Enter a group name and select members');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/groups', {
        name: groupName.trim(),
        member_ids: selected.map((u) => u.id),
      });
      await fetchConversations();
      if (res.data.conversation_id) setActiveConversation(res.data.conversation_id);
      showToast('success', 'Group created!');
      setShowGroupCreate(false);
    } catch {
      showToast('error', 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={showGroupCreate} onOpenChange={(open) => setShowGroupCreate(open)} size="md" placement="center" scrollBehavior="inside"
      classNames={{ base: 'bg-content1 border border-divider', header: 'border-b border-divider', body: 'p-0', footer: 'border-t border-divider' }}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          {step === 'info' && (
            <Button isIconOnly variant="light" size="sm" radius="full" onPress={() => setStep('members')} aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{step === 'members' ? 'Add Members' : 'Group Info'}</h2>
            <p className="text-xs text-default-400 font-normal">
              {step === 'members' ? `${selected.length} selected` : 'Name your group'}
            </p>
          </div>
        </ModalHeader>

        <ModalBody>
          {step === 'members' ? (
            <>
              {/* Selected chips */}
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                  {selected.map((u) => (
                    <Chip key={u.id} variant="flat" color="primary" size="sm" onClose={() => toggleUser(u)}>
                      {u.display_name || u.username}
                    </Chip>
                  ))}
                </div>
              )}

              <div className="px-4 py-3">
                <Input
                  value={query}
                  onValueChange={search}
                  placeholder="Search users..."
                  variant="flat"
                  size="sm"
                  radius="lg"
                  startContent={<Search className="w-4 h-4 text-default-400" />}
                  classNames={{ inputWrapper: 'bg-content2' }}
                  autoFocus
                />
              </div>

              <div className="max-h-[280px] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="md" color="primary" />
                  </div>
                ) : results.length > 0 ? (
                  results.map((u) => {
                    const isSelected = selected.some((s) => s.id === u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleUser(u)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-content2 transition-colors"
                      >
                        <Avatar name={(u.display_name || u.username).slice(0, 2).toUpperCase()} src={u.avatar_url} size="sm" />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-semibold text-foreground truncate">{u.display_name || u.username}</p>
                          <p className="text-xs text-default-400">@{u.username}</p>
                        </div>
                        <Checkbox isSelected={isSelected} color="primary" size="sm" />
                      </button>
                    );
                  })
                ) : query ? (
                  <p className="text-center text-sm text-default-400 py-8">No users found</p>
                ) : (
                  <p className="text-center text-sm text-default-400 py-8">Search for users to add</p>
                )}
              </div>
            </>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-colors">
                  <Camera className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <Input
                    value={groupName}
                    onValueChange={setGroupName}
                    label="Group Name"
                    variant="bordered"
                    size="sm"
                    placeholder="Enter group name"
                    maxLength={64}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-default-400 uppercase tracking-wide mb-2">
                  Members ({selected.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {selected.map((u) => (
                    <div key={u.id} className="flex items-center gap-1.5 text-xs text-default-500">
                      <Avatar name={(u.display_name || u.username).slice(0, 2).toUpperCase()} src={u.avatar_url} size="sm" className="w-6 h-6" />
                      <span>{u.display_name || u.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          {step === 'members' ? (
            <Button color="primary" fullWidth radius="lg" isDisabled={selected.length === 0} onPress={() => setStep('info')}
              endContent={<ArrowRight className="w-4 h-4" />} className="font-semibold">
              Next
            </Button>
          ) : (
            <Button color="primary" fullWidth radius="lg" isDisabled={creating || !groupName.trim()} isLoading={creating}
              onPress={handleCreate} className="font-semibold">
              Create Group
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
