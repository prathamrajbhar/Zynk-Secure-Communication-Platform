'use client';

import { useState, useEffect, useMemo } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { getInitials, cn, getAvatarColor, formatTime } from '@/lib/utils';
import {
  X, Image as ImageIcon, FileText, Link2, Ban,
  Flag, Loader2, Download, Phone, Video, Lock,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface SharedFile {
  file_id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

interface UserProfile {
  user_id: string;
  username: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  last_seen_at?: string;
  is_online?: boolean;
}

interface UserInfoPanelProps {
  userId: string;
  conversationId: string;
  onClose: () => void;
  onCall?: (type: 'audio' | 'video') => void;
}

export default function UserInfoPanel({ userId, conversationId, onClose, onCall }: UserInfoPanelProps) {
  const { onlineUsers } = useChatStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links'>('media');
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);

  const isOnline = onlineUsers.has(userId);

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      try {
        const res = await api.get(`/users/${userId}`);
        setProfile(res.data);
      } catch {
        toast.error('Failed to load profile');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();

    // Check block status
    const checkBlocked = async () => {
      try {
        const res = await api.get('/users/contacts/blocked');
        const blocked = (res.data.blocked || res.data.contacts || res.data || []);
        setIsBlocked(blocked.some((c: { contact_id: string }) => c.contact_id === userId));
      } catch { /* ignore */ }
    };
    checkBlocked();
  }, [userId]);

  useEffect(() => {
    const fetchSharedFiles = async () => {
      setIsLoadingFiles(true);
      try {
        const res = await api.get(`/files/conversation/${conversationId}`);
        setSharedFiles(res.data.files || res.data || []);
      } catch { /* ignore */ }
      finally { setIsLoadingFiles(false); }
    };
    fetchSharedFiles();
  }, [conversationId]);

  const mediaFiles = useMemo(() => sharedFiles.filter(f => f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/')), [sharedFiles]);
  const docFiles = useMemo(() => sharedFiles.filter(f => !f.mime_type?.startsWith('image/') && !f.mime_type?.startsWith('video/')), [sharedFiles]);


  const handleBlock = async () => {
    try {
      if (isBlocked) {
        await api.put(`/users/contacts/${userId}/unblock`);
        setIsBlocked(false);
        toast.success('User unblocked');
      } else {
        await api.put(`/users/contacts/${userId}/block`);
        setIsBlocked(true);
        toast.success('User blocked');
      }
    } catch {
      toast.error('Action failed');
    }
  };

  const handleReport = async () => {
    if (!reportReason.trim()) { toast.error('Please provide a reason'); return; }
    try {
      // Report endpoint - we'll handle gracefully if not available
      await api.post('/reports', { reported_user_id: userId, reason: reportReason.trim() });
      toast.success('Report submitted');
      setShowReportModal(false);
      setReportReason('');
    } catch {
      toast.error('Failed to submit report');
    }
  };

  const handleDownload = async (file: SharedFile) => {
    try {
      const res = await api.get(`/files/${file.file_id}/download`, { responseType: 'blob', timeout: 120000 });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  if (isLoading) {
    return (
      <div className="w-[340px] h-full border-l border-[var(--border)] bg-[var(--bg-surface)] flex items-center justify-center flex-shrink-0">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  const displayName = profile?.display_name || profile?.username || 'Unknown';
  const color = getAvatarColor(displayName);

  return (
    <div className="w-[340px] h-full border-l border-[var(--border)] bg-[var(--bg-surface)] flex flex-col flex-shrink-0 animate-fade-in">
      {/* Header */}
      <div className="h-[64px] px-4 flex items-center justify-between border-b border-[var(--border)] flex-shrink-0">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Contact Info</h3>
        <button onClick={onClose} className="btn-icon">
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin">
        {/* Profile section */}
        <div className="p-6 text-center">
          <div className="relative inline-block">
            {profile?.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={profile.avatar_url} alt={displayName} className="w-20 h-20 rounded-full object-cover mx-auto" />
            ) : (
              <div className={cn('w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto', color)}>
                {getInitials(displayName)}
              </div>
            )}
            {isOnline && (
              <div className="absolute bottom-1 right-1 w-4 h-4 bg-[var(--success)] rounded-full border-[3px] border-[var(--bg-surface)] online-pulse" />
            )}
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] mt-3">{displayName}</h2>
          <p className="text-sm text-[var(--text-muted)]">@{profile?.username}</p>
          {profile?.bio && (
            <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-[260px] mx-auto">{profile.bio}</p>
          )}
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {isOnline ? (
              <span className="text-[var(--success)] flex items-center justify-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" /> Online
              </span>
            ) : profile?.last_seen_at ? (
              `Last seen ${formatTime(profile.last_seen_at)}`
            ) : 'Offline'}
          </p>

          {/* Quick action buttons */}
          {onCall && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button onClick={() => onCall('audio')}
                className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] hover:bg-[var(--accent-muted)] transition-colors">
                <Phone className="w-4 h-4" />
              </button>
              <button onClick={() => onCall('video')}
                className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] hover:bg-[var(--accent-muted)] transition-colors">
                <Video className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Encryption info */}
        <div className="mx-4 mb-4 p-3 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-muted)]">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[var(--accent)]" />
            <div>
              <p className="text-xs font-semibold text-[var(--accent)]">Encryption</p>
              <p className="text-[11px] text-[var(--text-muted)]">Messages are end-to-end encrypted</p>
            </div>
          </div>
        </div>

        <div className="h-px bg-[var(--separator)] mx-4" />

        {/* Shared media/files/links tabs */}
        <div className="px-4 pt-4">
          <div className="flex bg-[var(--bg-wash)] rounded-lg p-0.5 mb-3">
            {([
              { id: 'media' as const, label: 'Media', icon: ImageIcon, count: mediaFiles.length },
              { id: 'files' as const, label: 'Files', icon: FileText, count: docFiles.length },
              { id: 'links' as const, label: 'Links', icon: Link2, count: 0 },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-md transition-all',
                  activeTab === tab.id
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-soft'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                )}>
                <tab.icon className="w-3 h-3" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="text-[10px] bg-[var(--bg-wash)] px-1 rounded">{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
            </div>
          ) : (
            <div className="pb-4">
              {activeTab === 'media' && (
                mediaFiles.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1">
                    {mediaFiles.map(f => (
                      <button key={f.file_id} onClick={() => handleDownload(f)}
                        className="aspect-square rounded-lg bg-[var(--bg-wash)] overflow-hidden hover:opacity-80 transition-opacity">
                        <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                          <ImageIcon className="w-5 h-5 opacity-40" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyTab label="No shared media" />
                )
              )}
              {activeTab === 'files' && (
                docFiles.length > 0 ? (
                  <div className="space-y-1">
                    {docFiles.map(f => (
                      <button key={f.file_id} onClick={() => handleDownload(f)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--hover)] transition-colors text-left group">
                        <div className="w-9 h-9 rounded-lg bg-[var(--bg-wash)] flex items-center justify-center text-[var(--text-muted)] flex-shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{f.filename}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">{formatSize(f.file_size)} · {formatTime(f.created_at)}</p>
                        </div>
                        <Download className="w-4 h-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyTab label="No shared files" />
                )
              )}
              {activeTab === 'links' && <EmptyTab label="No shared links" />}
            </div>
          )}
        </div>

        <div className="h-px bg-[var(--separator)] mx-4" />

        {/* Actions */}
        <div className="p-4 space-y-1">
          <button onClick={handleBlock}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium',
              isBlocked ? 'text-[var(--accent)] hover:bg-[var(--accent-subtle)]' : 'text-[var(--danger)] hover:bg-red-500/5'
            )}>
            <Ban className="w-4 h-4" />
            {isBlocked ? 'Unblock user' : 'Block user'}
          </button>
          <button onClick={() => setShowReportModal(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--danger)] hover:bg-red-500/5 transition-colors text-sm font-medium">
            <Flag className="w-4 h-4" />
            Report user
          </button>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 animate-fade-in" onClick={() => setShowReportModal(false)}>
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-sm p-6 shadow-overlay border border-[var(--border)] animate-scale-in mx-4"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">Report User</h3>
            <p className="text-sm text-[var(--text-muted)] mb-4">Why are you reporting @{profile?.username}?</p>
            <div className="space-y-2 mb-4">
              {['Spam', 'Harassment', 'Inappropriate content', 'Impersonation', 'Other'].map(reason => (
                <button key={reason} onClick={() => setReportReason(reason)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all border',
                    reportReason === reason
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                      : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'
                  )}>
                  {reason}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => { setShowReportModal(false); setReportReason(''); }}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--hover)] transition-colors">
                Cancel
              </button>
              <button onClick={handleReport} disabled={!reportReason}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--danger)] rounded-xl hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50">
                Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
      <p className="text-xs">{label}</p>
    </div>
  );
}
