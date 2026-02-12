// ═══════════════════════════════════════════════════════
// ZYNK UI — Profile Panel (HeroUI v7)
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';
import {
  Modal, ModalContent, ModalHeader, ModalBody,
  Button, Input, Textarea, Avatar,
} from '@heroui/react';
import { Camera, Edit3, Check, Loader2, Shield, Calendar, AtSign, User } from 'lucide-react';
import api from '@/lib/api';
import { showToast } from '@/components/ui';

export default function ProfilePanel() {
  const { user, updateProfile } = useAuthStore();
  const { showProfile, setShowProfile } = useUIStore();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const initials = (user?.display_name || user?.username || 'U').slice(0, 2).toUpperCase();

  return (
    <Modal isOpen={showProfile} onOpenChange={(open) => setShowProfile(open)} size="sm" placement="center"
      classNames={{ base: 'bg-content1 border border-divider', header: 'border-b border-divider' }}>
      <ModalContent>
        <ModalHeader className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Profile</h2>
          <div className="flex items-center gap-1">
            {editing ? (
              <Button size="sm" color="primary" radius="lg" isLoading={saving} onPress={handleSave} startContent={!saving && <Check className="w-3.5 h-3.5" />}>
                Save
              </Button>
            ) : (
              <Button isIconOnly variant="light" size="sm" radius="full" onPress={() => setEditing(true)} aria-label="Edit profile">
                <Edit3 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </ModalHeader>

        <ModalBody className="pb-6">
          {/* Avatar */}
          <div className="flex flex-col items-center pt-4 pb-2">
            <div className="relative group">
              <Avatar name={initials} src={user?.avatar_url} className="w-20 h-20 text-xl" isBordered color="primary" />
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
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleAvatarUpload(e.target.files)} />
            </div>

            {editing ? (
              <Input
                value={displayName}
                onValueChange={setDisplayName}
                variant="underlined"
                size="sm"
                color="primary"
                placeholder="Display name"
                classNames={{ base: 'mt-3 max-w-[200px]', input: 'text-center text-lg font-bold' }}
              />
            ) : (
              <h3 className="mt-3 text-lg font-bold text-foreground">
                {user?.display_name || user?.username}
              </h3>
            )}
            <p className="text-xs text-default-400 mt-0.5">@{user?.username}</p>
          </div>

          {/* Info */}
          <div className="space-y-3 mt-2">
            {/* Bio */}
            <div className="p-3 rounded-xl bg-content2">
              <div className="flex items-center gap-2 mb-1.5">
                <User className="w-3.5 h-3.5 text-default-400" />
                <span className="text-2xs font-semibold text-default-400 uppercase tracking-wide">Bio</span>
              </div>
              {editing ? (
                <Textarea
                  value={bio}
                  onValueChange={setBio}
                  variant="flat"
                  size="sm"
                  minRows={2}
                  maxRows={4}
                  placeholder="Write something about yourself..."
                  maxLength={200}
                  classNames={{ inputWrapper: 'bg-transparent shadow-none' }}
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
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

function InfoRow({ icon: Icon, label, value, accent }: {
  icon: typeof AtSign; label: string; value: string; accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-content2">
      <Icon className={cn('w-4 h-4 flex-shrink-0', accent ? 'text-primary' : 'text-default-400')} />
      <div>
        <p className="text-2xs font-semibold text-default-400 uppercase tracking-wide">{label}</p>
        <p className={cn('text-sm', accent ? 'text-primary font-medium' : 'text-foreground')}>{value}</p>
      </div>
    </div>
  );
}
