// ═══════════════════════════════════════════════════════
// ZYNK UI — User Info Panel (HeroUI v7)
// Right sidebar panel for user profiles in 1:1 chats
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useCallStore } from '@/stores/callStore';
import { cn, formatTime } from '@/lib/utils';
import {
  Avatar, Button, Card, CardBody, Divider,
} from '@heroui/react';
import {
  X, Phone, Video, Bell, BellOff, Pin, Archive, Trash2,
  Lock, ChevronRight, Image, File, Link, Star,
  Calendar, AtSign,
} from 'lucide-react';
import api from '@/lib/api';

interface UserInfoPanelProps {
  userId: string;
  conversationId: string;
  onClose: () => void;
}

interface UserProfile {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  last_seen_at?: string;
  created_at?: string;
  is_online?: boolean;
}

export default function UserInfoPanel({ userId, conversationId, onClose }: UserInfoPanelProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toggleMuteChat, togglePinChat, mutedChats, pinnedChats, deleteConversation, clearChatHistory } = useChatStore();
  const { initiateCall } = useCallStore();

  const isMuted = mutedChats.has(conversationId);
  const isPinned = pinnedChats.has(conversationId);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/users/${userId}`);
        setProfile(res.data);
      } catch {
        const conv = useChatStore.getState().conversations.find((c) => c.id === conversationId);
        if (conv?.other_user) {
          setProfile({
            id: conv.other_user.user_id,
            username: conv.other_user.username,
            display_name: conv.other_user.display_name,
            avatar_url: conv.other_user.avatar_url,
            last_seen_at: conv.other_user.last_seen_at,
            is_online: conv.is_online,
          });
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId, conversationId]);

  const name = profile?.display_name || profile?.username || 'User';
  const initials = name.slice(0, 2).toUpperCase();

  const handleCall = (type: 'audio' | 'video') => {
    if (!profile) return;
    initiateCall(profile.id, profile.display_name || profile.username, profile.avatar_url, conversationId, type);
  };

  if (loading) {
    return (
      <div className="w-80 border-l border-divider bg-content1 flex items-center justify-center">
        <div className="animate-pulse text-default-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <aside className="w-80 border-l border-divider bg-content1 flex flex-col overflow-hidden animate-appear h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
        <h3 className="text-sm font-bold text-foreground">Contact Info</h3>
        <Button isIconOnly variant="light" size="sm" radius="full" onPress={onClose} aria-label="Close">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Profile */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center pt-6 pb-4 px-4">
          <Avatar name={initials} src={profile?.avatar_url} className="w-20 h-20 text-xl" isBordered color={profile?.is_online ? 'success' : 'default'} />
          <h3 className="mt-3 text-lg font-bold text-foreground">{name}</h3>
          <p className="text-xs text-default-400">@{profile?.username}</p>
          {profile?.is_online ? (
            <span className="text-xs text-success font-medium mt-1">Online</span>
          ) : profile?.last_seen_at ? (
            <span className="text-xs text-default-400 mt-1">Last seen {formatTime(profile.last_seen_at)}</span>
          ) : null}
        </div>

        {/* Quick actions */}
        <div className="flex items-center justify-center gap-4 pb-4">
          <QuickAction icon={Phone} label="Audio" onClick={() => handleCall('audio')} />
          <QuickAction icon={Video} label="Video" onClick={() => handleCall('video')} />
          <QuickAction icon={isMuted ? BellOff : Bell} label={isMuted ? 'Unmute' : 'Mute'} onClick={() => toggleMuteChat(conversationId)} />
        </div>

        <Divider />

        {/* Bio */}
        {profile?.bio && (
          <>
            <div className="px-4 py-3">
              <p className="text-2xs font-semibold text-default-400 uppercase tracking-wide mb-1">Bio</p>
              <p className="text-sm text-foreground leading-relaxed">{profile.bio}</p>
            </div>
            <Divider />
          </>
        )}

        {/* Info rows */}
        <div className="px-4 py-3 space-y-1">
          <InfoRow icon={AtSign} label="Username" value={`@${profile?.username}`} />
          {profile?.created_at && (
            <InfoRow
              icon={Calendar}
              label="Joined"
              value={new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
            />
          )}
        </div>

        <Divider />

        {/* Encryption */}
        <div className="px-4 py-3">
          <Card className="bg-primary/10 border border-primary/20">
            <CardBody className="flex-row gap-3 p-3">
              <Lock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">Encryption</p>
                <p className="text-xs text-default-400 mt-0.5">
                  Messages are end-to-end encrypted with X25519 + AES-256-GCM.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        <Divider />

        {/* Media, Files, Links */}
        <div className="px-4 py-3 space-y-1">
          <MediaRow icon={Image} label="Photos & Videos" count="—" />
          <MediaRow icon={File} label="Documents" count="—" />
          <MediaRow icon={Link} label="Links" count="—" />
          <MediaRow icon={Star} label="Starred Messages" count="—" />
        </div>

        <Divider />

        {/* Chat actions */}
        <div className="px-4 py-3 space-y-1">
          <ActionRow icon={Pin} label={isPinned ? 'Unpin Chat' : 'Pin Chat'} onClick={() => togglePinChat(conversationId)} />
          <ActionRow icon={Archive} label="Archive Chat" onClick={() => {}} />
          <ActionRow icon={Trash2} label="Clear History" onClick={() => clearChatHistory(conversationId)} danger />
          <ActionRow icon={Trash2} label="Delete Chat" onClick={() => deleteConversation(conversationId)} danger />
        </div>
      </div>
    </aside>
  );
}


function QuickAction({ icon: Icon, label, onClick }: { icon: typeof Phone; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl hover:bg-content2 transition-colors">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <span className="text-2xs text-default-400 font-medium">{label}</span>
    </button>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof AtSign; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="w-4 h-4 text-default-400 flex-shrink-0" />
      <div>
        <p className="text-2xs text-default-400">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

function MediaRow({ icon: Icon, label, count }: { icon: typeof Image; label: string; count: string }) {
  return (
    <button className="w-full flex items-center justify-between py-2.5 hover:bg-content2 rounded-lg px-2 -mx-2 transition-colors">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-default-400" />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-default-400">{count}</span>
        <ChevronRight className="w-4 h-4 text-default-400" />
      </div>
    </button>
  );
}

function ActionRow({ icon: Icon, label, onClick, danger }: {
  icon: typeof Pin; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 py-2.5 px-2 -mx-2 rounded-lg transition-colors',
        danger ? 'text-danger hover:bg-danger/10' : 'text-default-500 hover:bg-content2',
      )}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm">{label}</span>
    </button>
  );
}
