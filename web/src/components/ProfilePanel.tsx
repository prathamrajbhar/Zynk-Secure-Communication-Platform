// ═══════════════════════════════════════════════════════
// ZYNK UI — Profile Panel (Discord-style)
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';
import { ZAvatar, showToast } from '@/components/ui';
import { Camera, Edit3, Check, Loader2, Shield, Calendar, AtSign, User, X } from 'lucide-react';
import api from '@/lib/api';

export default function ProfilePanel() {
  const { user, updateProfile } = useAuthStore();
  const { showProfile, setShowProfile } = useUIStore();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset form when opening
  useEffect(() => {
    if (showProfile) {
      setDisplayName(user?.display_name || '');
      setBio(user?.bio || '');
      setEditing(false);
    }
  }, [showProfile, user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ display_name: displayName, bio });
      setEditing(false);
      showToast('success', 'Profile updated');
    } catch {
      showToast('error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', files[0]);
      await api.put('/account/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await useAuthStore.getState().fetchUser();
      showToast('success', 'Avatar updated');
    } catch {
      showToast('error', 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  if (!showProfile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setShowProfile(false)}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">Profile</h2>
          <div className="flex items-center gap-2">
            {editing ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Save
              </button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground"
                aria-label="Edit profile"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowProfile(false)}
              className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5 max-h-[70vh] overflow-y-auto chat-scrollbar">
          {/* Avatar */}
          <div className="flex flex-col items-center pb-4">
            <div className="relative group">
              <ZAvatar
                name={user?.display_name || user?.username || 'U'}
                src={user?.avatar_url}
                size="xl"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Change avatar"
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleAvatarUpload(e.target.files)}
              />
            </div>

            {editing ? (
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="mt-3 w-48 text-center text-lg font-bold bg-transparent border-b-2 border-primary/40 focus:border-primary outline-none text-foreground transition-colors"
              />
            ) : (
              <h3 className="mt-3 text-lg font-bold text-foreground">
                {user?.display_name || user?.username}
              </h3>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">@{user?.username}</p>
          </div>

          {/* Info sections */}
          <div className="space-y-3">
            {/* Bio */}
            <div className="p-3 rounded-xl bg-secondary/50">
              <div className="flex items-center gap-2 mb-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Bio</span>
              </div>
              {editing ? (
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Write something about yourself..."
                  maxLength={200}
                  rows={3}
                  className="w-full bg-transparent text-sm text-foreground resize-none outline-none placeholder:text-muted-foreground/50"
                />
              ) : (
                <p className="text-sm text-foreground">{user?.bio || 'No bio yet'}</p>
              )}
            </div>

            <InfoRow icon={AtSign} label="Username" value={`@${user?.username}`} />
            {user?.created_at && (
              <InfoRow
                icon={Calendar}
                label="Joined"
                value={new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
              />
            )}
            <InfoRow icon={Shield} label="Encryption" value="E2EE Active" accent />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, accent }: {
  icon: typeof AtSign; label: string; value: string; accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
      <Icon className={cn('w-4 h-4 flex-shrink-0', accent ? 'text-primary' : 'text-muted-foreground')} />
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn('text-sm', accent ? 'text-primary font-medium' : 'text-foreground')}>{value}</p>
      </div>
    </div>
  );
}
