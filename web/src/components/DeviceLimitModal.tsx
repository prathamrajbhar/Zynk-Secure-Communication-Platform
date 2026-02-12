// ═══════════════════════════════════════════════════════
// ZYNK UI — Device Limit Modal (Discord-style)
// ═══════════════════════════════════════════════════════

'use client';

import { Monitor, Smartphone, Tablet, Globe, Loader2 } from 'lucide-react';

interface DeviceInfo {
  id: string;
  device_name: string;
  platform: string;
  last_active_at: string;
  created_at: string;
}

interface DeviceLimitModalProps {
  devices: DeviceInfo[];
  maxDevices: number;
  onRemoveAndLogin: (deviceId: string) => void;
  onCancel: () => void;
  loading: boolean;
}

const PLATFORM_ICONS: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  web: Globe,
};

function getDeviceIcon(platform: string) {
  return PLATFORM_ICONS[platform.toLowerCase()] || Globe;
}

export default function DeviceLimitModal({ devices, maxDevices, onRemoveAndLogin, onCancel, loading }: DeviceLimitModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">Device Limit Reached</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Max {maxDevices} devices. Remove one to sign in.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <div className="space-y-2 max-h-[320px] overflow-y-auto chat-scrollbar">
            {devices.map((device) => {
              const Icon = getDeviceIcon(device.platform);
              return (
                <div
                  key={device.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-secondary border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{device.device_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Last active: {new Date(device.last_active_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemoveAndLogin(device.id)}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs font-semibold text-destructive bg-destructive/10 rounded-lg hover:bg-destructive/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="w-full py-2.5 text-sm font-semibold text-foreground bg-secondary rounded-xl hover:bg-accent transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
