'use client';

import { useState, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { X, Camera, Loader2, User } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function ProfilePanel() {
  const { showProfile: showProfileModal, setShowProfile: setShowProfileModal } = useUIStore();
  const { user, updateProfile } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (showProfileModal && user) {
      setDisplayName(user.display_name || '');
      setBio(user.bio || '');
    }
  }, [showProfileModal, user]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProfile({
        display_name: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      toast.success('Profile updated');
      setShowProfileModal(false);
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (!showProfileModal) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowProfileModal(false)}>
      <div
        className="bg-[var(--bg-secondary)] rounded-xl max-w-md w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Edit Profile</h3>
          <button
            onClick={() => setShowProfileModal(false)}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-zynk-600 flex items-center justify-center text-white text-3xl font-bold">
                {getInitials(displayName || user?.username || '?')}
              </div>
              <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[var(--bg-tertiary)] border-2 border-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-zynk-100 dark:hover:bg-zynk-900/30 transition-colors">
                <Camera className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Username (read-only) */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Username</label>
            <div className="input-field bg-[var(--bg-primary)] text-[var(--text-muted)] cursor-not-allowed flex items-center gap-2">
              <User className="w-4 h-4" />
              @{user?.username || 'unknown'}
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-field"
              placeholder="Your display name"
              maxLength={100}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="input-field resize-none"
              placeholder="Tell people about yourself"
              rows={3}
              maxLength={300}
            />
            <p className="text-xs text-[var(--text-muted)] mt-1 text-right">{bio.length}/300</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowProfileModal(false)}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
