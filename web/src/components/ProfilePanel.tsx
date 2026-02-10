'use client';

import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { X, Camera, Loader2, AtSign } from 'lucide-react';
import { getInitials, cn, getAvatarColor } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function ProfilePanel() {
  const { showProfile, setShowProfile } = useUIStore();
  const { user, updateProfile } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showProfile && user) {
      setDisplayName(user.display_name || '');
      setBio(user.bio || '');
      setAvatarPreview(user.avatar_url || null);
    }
  }, [showProfile, user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const avatarUrl = `${API_URL}/files/${res.data.file_id}/download`;
      await updateProfile({ avatar_url: avatarUrl });
      setAvatarPreview(avatarUrl);
      toast.success('Avatar updated');
    } catch {
      setAvatarPreview(user?.avatar_url || null);
      toast.error('Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try { await updateProfile({ display_name: displayName.trim() || undefined, bio: bio.trim() || undefined }); toast.success('Profile updated'); setShowProfile(false); }
    catch { toast.error('Failed to update profile'); }
    finally { setIsSaving(false); }
  };

  if (!showProfile) return null;

  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={() => setShowProfile(false)}>
      <div className="modal-content glass-card rounded-2xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center">
              <Camera className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Edit Profile</h3>
          </div>
          <button onClick={() => setShowProfile(false)} className="btn-icon text-[var(--text-muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex justify-center">
            <div className="relative group">
              {avatarPreview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarPreview} alt="Avatar" className="w-24 h-24 rounded-full object-cover shadow-lg transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <div className={cn('w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg transition-transform duration-300 group-hover:scale-105', getAvatarColor(user?.username || 'U'))}>
                  {getInitials(displayName || user?.username || '?')}
                </div>
              )}
              {isUploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
              )}
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              <button onClick={() => avatarInputRef.current?.click()} disabled={isUploadingAvatar}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white border-[3px] border-[var(--bg-surface)] shadow-md transition-transform duration-200 hover:scale-110">
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Username</label>
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] text-sm border border-[var(--border)]">
              <AtSign className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="font-medium">{user?.username || 'unknown'}</span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Display Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              className="input-modern" placeholder="Your display name" maxLength={100} />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">About</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)}
              className="input-modern resize-none" placeholder="Tell people about yourself" rows={3} maxLength={300} />
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5 text-right font-medium">{bio.length}/300</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={() => setShowProfile(false)} className="btn-secondary flex-1 !rounded-xl py-2.5 font-semibold">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="btn-primary btn-shimmer flex-1 flex items-center justify-center gap-2 !rounded-xl py-2.5 font-bold">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
