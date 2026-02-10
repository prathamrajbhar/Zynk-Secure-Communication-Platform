'use client';

import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { X, Camera, Loader2, AtSign } from 'lucide-react';
import { getInitials, cn, getAvatarColor } from '@/lib/utils';
import api, { API_URL } from '@/lib/api';
import toast from 'react-hot-toast';

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
      if (user.avatar_url && user.avatar_url.includes('/files/')) {
        const fileEndpoint = user.avatar_url.replace(API_URL, '');
        api.get(fileEndpoint, { responseType: 'blob', timeout: 60000 })
          .then(res => setAvatarPreview(URL.createObjectURL(res.data)))
          .catch(() => setAvatarPreview(null));
      } else {
        setAvatarPreview(user.avatar_url || null);
      }
    }
  }, [showProfile, user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setAvatarPreview(URL.createObjectURL(file));
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const fileId = res.data.file_id;
      const blobRes = await api.get(`/files/${fileId}/download`, { responseType: 'blob', timeout: 60000 });
      const blobUrl = URL.createObjectURL(blobRes.data);
      await updateProfile({ avatar_url: `${API_URL}/files/${fileId}/download` });
      setAvatarPreview(blobUrl);
      toast.success('Avatar updated');
    } catch { setAvatarPreview(user?.avatar_url || null); toast.error('Failed to upload avatar'); }
    finally { setIsUploadingAvatar(false); if (avatarInputRef.current) avatarInputRef.current.value = ''; }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try { await updateProfile({ display_name: displayName.trim() || undefined, bio: bio.trim() || undefined }); toast.success('Profile updated'); setShowProfile(false); }
    catch { toast.error('Failed to update'); }
    finally { setIsSaving(false); }
  };

  if (!showProfile) return null;

  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={() => setShowProfile(false)}>
      <div className="modal-content bg-[var(--bg-surface)] rounded-xl max-w-sm w-full overflow-hidden border border-[var(--border)] shadow-lg"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Edit Profile</h3>
          <button onClick={() => setShowProfile(false)} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative group">
              {avatarPreview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarPreview} alt="Avatar" className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div className={cn('w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold', getAvatarColor(user?.username || 'U'))}>
                  {getInitials(displayName || user?.username || '?')}
                </div>
              )}
              {isUploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                </div>
              )}
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              <button onClick={() => avatarInputRef.current?.click()} disabled={isUploadingAvatar}
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-white border-2 border-[var(--bg-surface)] hover:scale-110 transition-transform">
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Username (read-only) */}
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Username</label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-wash)] text-[var(--text-muted)] text-sm border border-[var(--border)]">
              <AtSign className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="font-medium">{user?.username || 'unknown'}</span>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Display Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              className="input-field" placeholder="Your display name" maxLength={100} />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">About</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)}
              className="input-field resize-none" placeholder="About you" rows={3} maxLength={300} />
            <p className="text-[10px] text-[var(--text-muted)] mt-1 text-right">{bio.length}/300</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowProfile(false)} className="btn-secondary flex-1 !rounded-lg py-2">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="btn-primary flex-1 !rounded-lg py-2 flex items-center justify-center gap-2">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}