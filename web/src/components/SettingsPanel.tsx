'use client';

import { useState, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { X, Moon, Sun, Shield, Monitor, Smartphone, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Device {
  id: string;
  device_name: string;
  device_type: string;
  last_active: string;
  is_current?: boolean;
}

export default function SettingsPanel() {
  const { showSettings: showSettingsModal, setShowSettings: setShowSettingsModal, theme, toggleTheme } = useUIStore();
  useAuthStore();
  const [devices, setDevices] = useState<Device[]>([]);
  const [privacy, setPrivacy] = useState({
    show_online_status: true,
    show_last_seen: true,
    show_read_receipts: true,
  });

  useEffect(() => {
    if (showSettingsModal) {
      loadDevices();
      loadPrivacy();
    }
  }, [showSettingsModal]);

  const loadDevices = async () => {
    try {
      const res = await api.get('/auth/devices');
      setDevices(res.data.devices || res.data || []);
    } catch { }
  };

  const loadPrivacy = async () => {
    try {
      const res = await api.get('/auth/me');
      const settings = res.data.privacy_settings || {};
      setPrivacy({
        show_online_status: settings.show_online_status ?? true,
        show_last_seen: settings.show_last_seen ?? true,
        show_read_receipts: settings.allow_read_receipts ?? true,
      });
    } catch { }
  };

  const updatePrivacy = async (key: keyof typeof privacy, value: boolean) => {
    setPrivacy((prev) => ({ ...prev, [key]: value }));
    try {
      await api.put('/users/me/privacy', { [key]: value });
      toast.success('Privacy updated');
    } catch {
      toast.error('Failed to update');
    }
  };

  const removeDevice = async (deviceId: string) => {
    try {
      await api.delete(`/auth/devices/${deviceId}`);
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      toast.success('Device removed');
    } catch {
      toast.error('Failed to remove device');
    }
  };

  if (!showSettingsModal) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSettingsModal(false)}>
      <div
        className="bg-[var(--bg-secondary)] rounded-xl max-w-lg w-full max-h-[80vh] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Settings</h3>
          <button
            onClick={() => setShowSettingsModal(false)}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-6">
          {/* Appearance */}
          <section>
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Appearance
            </h4>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-primary)]">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="w-5 h-5 text-zynk-400" /> : <Sun className="w-5 h-5 text-yellow-500" />}
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Theme</p>
                  <p className="text-xs text-[var(--text-muted)]">{theme === 'dark' ? 'Dark' : 'Light'} mode</p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-sm text-[var(--text-secondary)] hover:bg-zynk-100 dark:hover:bg-zynk-900/30 transition-colors"
              >
                Switch to {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </section>

          {/* Privacy */}
          <section>
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" /> Privacy
            </h4>
            <div className="space-y-2">
              {[
                { key: 'show_online_status', label: 'Online Status', desc: 'Show when you are online' },
                { key: 'show_last_seen', label: 'Last Seen', desc: 'Show your last active time' },
                { key: 'show_read_receipts', label: 'Read Receipts', desc: 'Let others see when you read messages' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-primary)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => updatePrivacy(item.key as keyof typeof privacy, !privacy[item.key as keyof typeof privacy])}
                    className={`w-11 h-6 rounded-full transition-colors relative ${privacy[item.key as keyof typeof privacy] ? 'bg-zynk-600' : 'bg-gray-400'
                      }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${privacy[item.key as keyof typeof privacy] ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Devices */}
          <section>
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> Active Devices
            </h4>
            <div className="space-y-2">
              {devices.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] p-3">No device info available</p>
              ) : devices.map(device => (
                <div key={device.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-primary)]">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-[var(--text-muted)]" />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {device.device_name || 'Unknown Device'}
                        {device.is_current && (
                          <span className="ml-2 text-xs text-zynk-500">(Current)</span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{device.device_type}</p>
                    </div>
                  </div>
                  {!device.is_current && (
                    <button
                      onClick={() => removeDevice(device.id)}
                      className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500"
                      title="Remove device"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
