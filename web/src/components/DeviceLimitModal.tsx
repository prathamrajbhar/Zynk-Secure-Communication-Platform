'use client';

import { useState } from 'react';
import {
  Monitor, Smartphone, Tablet, Globe, Laptop,
  Trash2, X, Loader2, AlertTriangle, Shield,
  Clock, CheckCircle2, ChevronRight
} from 'lucide-react';

interface Device {
  id: string;
  device_name: string;
  platform: string;
  last_active_at: string;
  created_at: string;
}

interface DeviceLimitModalProps {
  devices: Device[];
  maxDevices?: number;
  onRemoveAndLogin: (deviceId: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

function getPlatformIcon(platform: string) {
  switch (platform?.toLowerCase()) {
    case 'ios':
    case 'android':
      return <Smartphone className="w-5 h-5" />;
    case 'tablet':
    case 'ipad':
      return <Tablet className="w-5 h-5" />;
    case 'desktop':
    case 'macos':
    case 'windows':
    case 'linux':
      return <Laptop className="w-5 h-5" />;
    case 'web':
      return <Globe className="w-5 h-5" />;
    default:
      return <Monitor className="w-5 h-5" />;
  }
}

function getRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return 'Active now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isRecentlyActive(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff < 5 * 60 * 1000; // active in last 5 minutes
}

type Step = 'select' | 'confirm';

export default function DeviceLimitModal({
  devices,
  maxDevices = 5,
  onRemoveAndLogin,
  onCancel,
  loading,
}: DeviceLimitModalProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('select');

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  const handleProceed = () => {
    if (!selectedDeviceId) return;
    setStep('confirm');
  };

  const handleConfirmRemove = async () => {
    if (!selectedDeviceId) return;
    await onRemoveAndLogin(selectedDeviceId);
  };

  const handleBack = () => {
    setStep('select');
  };

  // Sort: least recently active first (suggested for removal)
  const sortedDevices = [...devices].sort(
    (a, b) => new Date(a.last_active_at).getTime() - new Date(b.last_active_at).getTime()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={!loading ? onCancel : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden animate-appear">

        {/* ─── Step 1: Select Device ─── */}
        {step === 'select' && (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight">
                      Device Limit Reached
                    </h2>
                    <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                      You&apos;re signed in on {devices.length}/{maxDevices} devices
                    </p>
                  </div>
                </div>
                <button
                  onClick={onCancel}
                  className="p-2 -mr-1 -mt-1 rounded-lg hover:bg-[var(--hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Info banner */}
            <div className="mx-6 mt-3 mb-4 px-4 py-3 rounded-xl bg-[var(--bg-wash)] border border-[var(--border-subtle)]">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                To sign in on this device, choose one below to <span className="font-semibold text-[var(--text-primary)]">sign out</span> and replace. That device will lose access immediately.
              </p>
            </div>

            {/* Device List */}
            <div className="px-4 pb-2 space-y-1.5 max-h-[340px] overflow-y-auto custom-scrollbar">
              {sortedDevices.map((device, index) => {
                const isSelected = selectedDeviceId === device.id;
                const recentlyActive = isRecentlyActive(device.last_active_at);
                const isOldest = index === 0 && !recentlyActive;

                return (
                  <button
                    key={device.id}
                    onClick={() => setSelectedDeviceId(device.id)}
                    disabled={loading}
                    className={`
                      w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border transition-all duration-150 text-left group
                      ${isSelected
                        ? 'border-red-500/40 bg-red-500/5 ring-1 ring-red-500/20'
                        : 'border-transparent hover:bg-[var(--hover)] hover:border-[var(--border)]'}
                      ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {/* Radio */}
                    <div className={`
                      w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                      ${isSelected
                        ? 'border-red-500 bg-red-500'
                        : 'border-[var(--text-muted)]/40 group-hover:border-[var(--text-muted)]'}
                    `}>
                      {isSelected && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>

                    {/* Icon */}
                    <div className={`
                      flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors
                      ${isSelected
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-[var(--bg-wash)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'}
                    `}>
                      {getPlatformIcon(device.platform)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold truncate transition-colors ${
                          isSelected ? 'text-red-500' : 'text-[var(--text-primary)]'
                        }`}>
                          {device.device_name}
                        </p>
                        {isOldest && !isSelected && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Oldest
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {recentlyActive ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active now
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                            <Clock className="w-3 h-3" />
                            {getRelativeTime(device.last_active_at)}
                          </span>
                        )}
                        <span className="text-[var(--text-muted)] text-xs">·</span>
                        <span className="text-xs text-[var(--text-muted)] capitalize">{device.platform}</span>
                      </div>
                    </div>

                    {/* Selected indicator */}
                    {isSelected && (
                      <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="px-6 pt-3 pb-5 flex gap-3">
              <button
                onClick={onCancel}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleProceed}
                disabled={!selectedDeviceId || loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-600 text-white transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* ─── Step 2: Confirm ─── */}
        {step === 'confirm' && selectedDevice && (
          <>
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight">
                      Confirm Sign Out
                    </h2>
                    <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                      This action cannot be undone
                    </p>
                  </div>
                </div>
                <button
                  onClick={!loading ? onCancel : undefined}
                  className="p-2 -mr-1 -mt-1 rounded-lg hover:bg-[var(--hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Selected device card */}
            <div className="mx-6 mt-4 mb-4">
              <div className="flex items-center gap-3.5 px-4 py-4 rounded-xl border border-red-500/30 bg-red-500/5">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0 text-red-500">
                  {getPlatformIcon(selectedDevice.platform)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {selectedDevice.device_name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {selectedDevice.platform} · Last active {getRelativeTime(selectedDevice.last_active_at)}
                  </p>
                </div>
                <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
              </div>
            </div>

            {/* What happens */}
            <div className="mx-6 mb-5 space-y-2.5">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">What will happen</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2.5 text-[13px] text-[var(--text-secondary)]">
                  <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-px">
                    <X className="w-3 h-3 text-red-500" />
                  </div>
                  <span><span className="font-semibold text-[var(--text-primary)]">&quot;{selectedDevice.device_name}&quot;</span> will be signed out instantly</span>
                </div>
                <div className="flex items-start gap-2.5 text-[13px] text-[var(--text-secondary)]">
                  <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-px">
                    <X className="w-3 h-3 text-red-500" />
                  </div>
                  <span>Any active sessions on that device will end</span>
                </div>
                <div className="flex items-start gap-2.5 text-[13px] text-[var(--text-secondary)]">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-px">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  </div>
                  <span>You&apos;ll be signed in on <span className="font-semibold text-[var(--text-primary)]">this device</span> instead</span>
                </div>
                <div className="flex items-start gap-2.5 text-[13px] text-[var(--text-secondary)]">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-px">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  </div>
                  <span>Your messages and data remain safe</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pt-1 pb-5 flex gap-3">
              <button
                onClick={handleBack}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleConfirmRemove}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-600 text-white transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove &amp; Sign In
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
