'use client';

import { useState, useEffect } from 'react';
import { useUIStore, COLOR_SCHEMES, CHAT_BACKGROUNDS, type ChatBubbleStyle, type FontSize } from '@/stores/uiStore';
import {
  X, Moon, Sun, Shield, Smartphone, Trash2,
  Palette, MessageSquare, Type, Info, Heart, Globe, Bell, BellOff,
  Eye, Clock, CheckCircle2,
  Volume2, VolumeX, Phone, HardDrive, ChevronRight,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface Device { id: string; device_name: string; platform: string; last_active_at: string; created_at: string; is_current?: boolean; }

const BUBBLE_STYLES: { id: ChatBubbleStyle; name: string }[] = [
  { id: 'gradient', name: 'Gradient' },
  { id: 'solid', name: 'Solid' },
  { id: 'minimal', name: 'Minimal' },
];

const FONT_SIZES: { id: FontSize; name: string }[] = [
  { id: 'small', name: 'Small' },
  { id: 'medium', name: 'Medium' },
  { id: 'large', name: 'Large' },
];

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={cn('relative w-10 h-[22px] rounded-full transition-all', active ? 'bg-[var(--accent)]' : 'bg-[var(--bg-wash)] border border-[var(--border)]')}>
      <span className={cn('absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all', active ? 'left-[20px]' : 'left-[2px]')} />
    </button>
  );
}

function SettingRow({ icon: Icon, label, desc, right, onClick }: {
  icon: React.ElementType; label: string; desc?: string; right?: React.ReactNode; onClick?: () => void;
}) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 transition-colors', onClick && 'cursor-pointer hover:bg-[var(--hover)]')} onClick={onClick}>
      <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[var(--accent)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)]">{label}</p>
        {desc && <p className="text-xs text-[var(--text-muted)] mt-0.5">{desc}</p>}
      </div>
      {right || (onClick && <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />)}
    </div>
  );
}

export default function SettingsPanel() {
  const {
    showSettings, setShowSettings, theme, toggleTheme,
    colorScheme, setColorScheme, bubbleStyle, setBubbleStyle,
    fontSize, setFontSize, compactMode, setCompactMode,
    animationsEnabled, setAnimationsEnabled, settingsTab, setSettingsTab,
    chatBackground, setChatBackground,
    messageSoundEnabled, setMessageSoundEnabled,
    callSoundEnabled, setCallSoundEnabled,
    notifSoundEnabled, setNotifSoundEnabled,
  } = useUIStore();
  const [devices, setDevices] = useState<Device[]>([]);
  const [privacy, setPrivacy] = useState({ show_online_status: true, show_last_seen: true, show_read_receipts: true });
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    if (showSettings) { loadDevices(); loadPrivacy(); setNotificationsEnabled(Notification.permission === 'granted'); }
  }, [showSettings]);

  const loadDevices = async () => { try { const r = await api.get('/auth/devices'); setDevices(r.data.devices || r.data || []); } catch { } };
  const loadPrivacy = async () => {
    try { const r = await api.get('/auth/me'); const s = r.data.privacy_settings || {}; setPrivacy({ show_online_status: s.show_online_status ?? true, show_last_seen: s.show_last_seen ?? true, show_read_receipts: s.allow_read_receipts ?? true }); } catch { }
  };
  const updatePrivacy = async (key: keyof typeof privacy, value: boolean) => {
    setPrivacy(p => ({ ...p, [key]: value }));
    const serverKey = key === 'show_read_receipts' ? 'allow_read_receipts' : key;
    try { await api.put('/users/me/privacy', { [serverKey]: value }); toast.success('Updated'); } catch { toast.error('Failed'); }
  };
  const removeDevice = async (id: string) => {
    try { await api.delete(`/auth/devices/${id}`); setDevices(p => p.filter(d => d.id !== id)); toast.success('Removed'); } catch { toast.error('Failed'); }
  };

  if (!showSettings) return null;

  const tabs = [
    { id: 'appearance' as const, icon: Palette, label: 'Appearance' },
    { id: 'notifications' as const, icon: Bell, label: 'Notifications' },
    { id: 'privacy' as const, icon: Shield, label: 'Privacy' },
    { id: 'devices' as const, icon: Smartphone, label: 'Devices' },
    { id: 'storage' as const, icon: HardDrive, label: 'Storage' },
    { id: 'about' as const, icon: Info, label: 'About' },
  ];

  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
      <div className="modal-content bg-[var(--bg-surface)] rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-[var(--border)] shadow-lg"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-base font-bold text-[var(--text-primary)]">Settings</h3>
          <button onClick={() => setShowSettings(false)} className="btn-icon"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-44 border-r border-[var(--border)] py-2 px-1.5 flex-shrink-0 bg-[var(--bg-app)]">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setSettingsTab(tab.id)}
                className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all mb-0.5',
                  settingsTab === tab.id ? 'bg-[var(--active)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]')}>
                <tab.icon className="w-4 h-4" /> {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scroll-thin">
            {settingsTab === 'appearance' && (
              <div>
                {/* Theme */}
                <div className="px-4 pt-4 pb-2">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Theme</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ key: 'light', icon: Sun, label: 'Light' }, { key: 'dark', icon: Moon, label: 'Dark' }].map(t => (
                      <button key={t.key} onClick={() => { if (theme !== t.key) toggleTheme(); }}
                        className={cn('p-3 rounded-lg border transition-all text-left flex items-center gap-3',
                          theme === t.key ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] hover:border-[var(--accent-muted)]')}>
                        <t.icon className="w-5 h-5 text-[var(--text-muted)]" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">{t.label}</span>
                        {theme === t.key && <CheckCircle2 className="w-4 h-4 text-[var(--accent)] ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Colors */}
                <div className="px-4 pt-3 pb-2">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Accent Color</p>
                  <div className="flex items-center gap-3">
                    {COLOR_SCHEMES.map(scheme => (
                      <button key={scheme.id} onClick={() => setColorScheme(scheme.id)} className="group flex flex-col items-center gap-1">
                        <div className={cn('color-swatch', colorScheme === scheme.id && 'active')} style={{ background: scheme.color }} />
                        <span className={cn('text-[10px]', colorScheme === scheme.id ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-muted)]')}>{scheme.name}</span>
                      </button>
                    ))}
                  </div>
                  {/* Preview */}
                  <div className="mt-3 p-3 bg-[var(--bg-wash)] rounded-lg">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-start"><div className="px-3 py-1.5 rounded-xl rounded-bl-sm bg-[var(--bubble-other)] text-[var(--bubble-other-text)] text-xs">Hey! 👋</div></div>
                      <div className="flex justify-end"><div className="px-3 py-1.5 rounded-xl rounded-br-sm bubble-own text-xs">Looking good! ✨</div></div>
                    </div>
                  </div>
                </div>

                <div className="my-2 h-px bg-[var(--border)]" />

                {/* Bubble Style */}
                <div className="px-4 py-2">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Bubble Style</p>
                  <div className="flex gap-2">
                    {BUBBLE_STYLES.map(s => (
                      <button key={s.id} onClick={() => setBubbleStyle(s.id)}
                        className={cn('flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all border',
                          bubbleStyle === s.id ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-muted)]')}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div className="px-4 py-2">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Font Size</p>
                  <div className="flex bg-[var(--bg-wash)] rounded-lg p-1 border border-[var(--border)]">
                    {FONT_SIZES.map(s => (
                      <button key={s.id} onClick={() => setFontSize(s.id)}
                        className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-all',
                          fontSize === s.id ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="my-2 h-px bg-[var(--border)]" />

                {/* Toggles */}
                <SettingRow icon={MessageSquare} label="Compact Mode" desc="Smaller spacing" right={<Toggle active={compactMode} onChange={() => setCompactMode(!compactMode)} />} />
                <SettingRow icon={Palette} label="Animations" desc="Smooth transitions" right={<Toggle active={animationsEnabled} onChange={() => setAnimationsEnabled(!animationsEnabled)} />} />

                <div className="my-2 h-px bg-[var(--border)]" />

                {/* Chat Background */}
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Chat Background</p>
                  <div className="grid grid-cols-4 gap-2">
                    {CHAT_BACKGROUNDS.map(bg => (
                      <button key={bg.id} onClick={() => setChatBackground(bg.id)}
                        className={cn('aspect-square rounded-lg border transition-all flex flex-col items-center justify-center gap-0.5 text-center',
                          chatBackground === bg.id ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] hover:border-[var(--accent-muted)]')}>
                        <span className="text-base">{bg.preview}</span>
                        <span className={cn('text-[9px] font-medium', chatBackground === bg.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')}>{bg.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {settingsTab === 'notifications' && (
              <div className="py-2">
                <SettingRow icon={notificationsEnabled ? Bell : BellOff} label="Desktop Notifications"
                  desc={notificationsEnabled ? 'Enabled' : 'Click to enable'}
                  right={<Toggle active={notificationsEnabled} onChange={async () => {
                    if (!notificationsEnabled) { const p = await Notification.requestPermission(); setNotificationsEnabled(p === 'granted'); }
                    else setNotificationsEnabled(false);
                  }} />} />
                <div className="my-1 h-px bg-[var(--border)]" />
                <SettingRow icon={messageSoundEnabled ? Volume2 : VolumeX} label="Message Sounds" desc="Incoming messages"
                  right={<Toggle active={messageSoundEnabled} onChange={() => setMessageSoundEnabled(!messageSoundEnabled)} />} />
                <SettingRow icon={callSoundEnabled ? Phone : VolumeX} label="Call Ringtone" desc="Incoming calls"
                  right={<Toggle active={callSoundEnabled} onChange={() => setCallSoundEnabled(!callSoundEnabled)} />} />
                <SettingRow icon={notifSoundEnabled ? Bell : BellOff} label="Notification Sounds" desc="Push notifications"
                  right={<Toggle active={notifSoundEnabled} onChange={() => setNotifSoundEnabled(!notifSoundEnabled)} />} />
                <div className="mx-4 mt-3 p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-muted)]">
                  <p className="text-xs text-[var(--text-secondary)]">If you denied browser notifications, re-enable them in your browser&apos;s site settings.</p>
                </div>
              </div>
            )}

            {settingsTab === 'privacy' && (
              <div className="py-2">
                <SettingRow icon={Globe} label="Online Status" desc="Show when you're online"
                  right={<Toggle active={privacy.show_online_status} onChange={() => updatePrivacy('show_online_status', !privacy.show_online_status)} />} />
                <SettingRow icon={Clock} label="Last Seen" desc="Show last active time"
                  right={<Toggle active={privacy.show_last_seen} onChange={() => updatePrivacy('show_last_seen', !privacy.show_last_seen)} />} />
                <SettingRow icon={Eye} label="Read Receipts" desc="Let others see when you read"
                  right={<Toggle active={privacy.show_read_receipts} onChange={() => updatePrivacy('show_read_receipts', !privacy.show_read_receipts)} />} />
              </div>
            )}

            {settingsTab === 'devices' && (
              <div className="py-2">
                {devices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
                    <Smartphone className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm font-medium text-[var(--text-secondary)]">No devices found</p>
                  </div>
                ) : devices.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-colors">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', d.is_current ? 'bg-[var(--accent-subtle)]' : 'bg-[var(--bg-wash)]')}>
                      <Smartphone className={cn('w-4 h-4', d.is_current ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text-primary)]">
                        {d.device_name || 'Unknown Device'}
                        {d.is_current && <span className="ml-1.5 text-[10px] font-semibold text-[var(--accent)]">(current)</span>}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{d.platform} · {new Date(d.last_active_at).toLocaleDateString()}</p>
                    </div>
                    {!d.is_current && (
                      <button onClick={() => removeDevice(d.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-[var(--danger)] transition-colors"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {settingsTab === 'storage' && (
              <div className="py-2">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-[var(--text-primary)]">Local Storage</p>
                    <span className="text-xs text-[var(--text-muted)]">{typeof window !== 'undefined' ? `${(JSON.stringify(localStorage).length / 1024).toFixed(1)} KB` : ''}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--bg-wash)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: '15%' }} />
                  </div>
                </div>
                <div className="my-1 h-px bg-[var(--border)]" />
                {[
                  { label: 'Clear Drafts', key: 'zynk-drafts' },
                  { label: 'Clear Mute Settings', key: 'zynk-mute-durations' },
                  { label: 'Clear Pinned Messages', key: 'zynk-pinned-messages' },
                  { label: 'Clear Starred Messages', key: 'zynk-starred-messages' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-[var(--text-primary)]">{item.label}</span>
                    <button onClick={() => { if (typeof window !== 'undefined') localStorage.removeItem(item.key); toast.success('Cleared'); }}
                      className="text-xs font-medium text-[var(--danger)] hover:underline">Clear</button>
                  </div>
                ))}
                <div className="mx-4 mt-3 p-3 rounded-lg border border-dashed border-[var(--danger)] bg-red-500/5">
                  <p className="text-sm font-medium text-[var(--danger)] mb-1">Clear All Data</p>
                  <p className="text-xs text-[var(--text-muted)] mb-2">Clears everything. You&apos;ll need to log in again. Encryption keys are preserved so old messages remain readable.</p>
                  <button onClick={() => {
                    if (confirm('Clear all data and log out? Your encryption keys will be preserved so you can still read old messages after re-login.')) {
                      // Preserve crypto keys (zynk_*) so old messages stay decryptable
                      const cryptoBackup: [string, string][] = [];
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key?.startsWith('zynk_pub_') || key?.startsWith('zynk_priv_') || key?.startsWith('zynk_group_own_') || key?.startsWith('zynk_group_received_')) {
                          const val = localStorage.getItem(key);
                          if (val) cryptoBackup.push([key, val]);
                        }
                      }
                      localStorage.clear();
                      cryptoBackup.forEach(([k, v]) => localStorage.setItem(k, v));
                      window.location.href = '/login';
                    }
                  }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--danger)] rounded-lg hover:brightness-110">Clear & Logout</button>
                </div>
              </div>
            )}

            {settingsTab === 'about' && (
              <div className="py-6">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-xl mx-auto mb-3 bg-[var(--accent)] flex items-center justify-center"><span className="text-white text-xl font-bold">Z</span></div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Zynk</h3>
                  <p className="text-xs text-[var(--text-muted)]">Version 2.0.0</p>
                </div>
                <div className="mx-4 space-y-1">
                  {[
                    { icon: Shield, label: 'End-to-end Encryption', desc: 'Messages encrypted by default' },
                    { icon: Type, label: 'Real-time Messaging', desc: 'Instant with WebSocket' },
                    { icon: Globe, label: 'Cross Platform', desc: 'Web, iOS, Android' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 p-2.5 rounded-lg">
                      <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0"><item.icon className="w-4 h-4 text-[var(--accent)]" /></div>
                      <div><p className="text-sm text-[var(--text-primary)]">{item.label}</p><p className="text-xs text-[var(--text-muted)]">{item.desc}</p></div>
                    </div>
                  ))}
                </div>
                <div className="text-center mt-6 pt-4 border-t border-[var(--border)] mx-4">
                  <p className="text-xs text-[var(--text-muted)]">Made with <Heart className="w-3 h-3 inline text-[var(--danger)]" /> by Zynk Team</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}