'use client';

import { useState, useEffect } from 'react';
import { useUIStore, COLOR_SCHEMES, type ChatBubbleStyle, type FontSize } from '@/stores/uiStore';
import {
  X, Moon, Sun, Shield, Monitor, Smartphone, Trash2,
  Palette, MessageSquare, Type, Sparkles,
  Zap, Info, Heart, Globe, Bell, BellOff,
  Layout, Eye, Clock, CheckCircle2
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { setNotificationSoundEnabled } from '@/lib/notifications';

interface Device { id: string; device_name: string; device_type: string; last_active: string; is_current?: boolean; }

const BUBBLE_STYLES: { id: ChatBubbleStyle; name: string; desc: string }[] = [
  { id: 'gradient', name: 'Gradient', desc: 'Rich gradient bubbles' },
  { id: 'solid', name: 'Solid', desc: 'Clean solid colors' },
  { id: 'minimal', name: 'Minimal', desc: 'Subtle & light' },
];

const FONT_SIZES: { id: FontSize; name: string; size: string }[] = [
  { id: 'small', name: 'Small', size: '13px' },
  { id: 'medium', name: 'Medium', size: '14px' },
  { id: 'large', name: 'Large', size: '16px' },
];

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className={cn(
        'relative w-11 h-6 rounded-full transition-all duration-300 ease-out',
        active ? 'bg-[var(--accent)]' : 'bg-[var(--bg-wash)] border border-[var(--border)]'
      )}>
      <span className={cn(
        'absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ease-out',
        active ? 'left-[22px]' : 'left-[2px]'
      )} />
    </button>
  );
}

export default function SettingsPanel() {
  const {
    showSettings, setShowSettings, theme, toggleTheme,
    colorScheme, setColorScheme, bubbleStyle, setBubbleStyle,
    fontSize, setFontSize, compactMode, setCompactMode,
    animationsEnabled, setAnimationsEnabled, settingsTab, setSettingsTab,
  } = useUIStore();
  const [devices, setDevices] = useState<Device[]>([]);
  const [privacy, setPrivacy] = useState({ show_online_status: true, show_last_seen: true, show_read_receipts: true });
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    if (showSettings) {
      loadDevices();
      loadPrivacy();
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, [showSettings]);

  const loadDevices = async () => { try { const r = await api.get('/auth/devices'); setDevices(r.data.devices || r.data || []); } catch { } };
  const loadPrivacy = async () => {
    try {
      const r = await api.get('/auth/me');
      const s = r.data.privacy_settings || {};
      setPrivacy({ show_online_status: s.show_online_status ?? true, show_last_seen: s.show_last_seen ?? true, show_read_receipts: s.allow_read_receipts ?? true });
    } catch { }
  };
  const updatePrivacy = async (key: keyof typeof privacy, value: boolean) => {
    setPrivacy(p => ({ ...p, [key]: value }));
    try { await api.put('/users/me/privacy', { [key]: value }); toast.success('Privacy updated'); }
    catch { toast.error('Failed to update'); }
  };
  const removeDevice = async (id: string) => {
    try { await api.delete(`/auth/devices/${id}`); setDevices(p => p.filter(d => d.id !== id)); toast.success('Device removed'); }
    catch { toast.error('Failed to remove device'); }
  };

  if (!showSettings) return null;

  const tabs = [
    { id: 'appearance' as const, icon: Palette, label: 'Appearance' },
    { id: 'notifications' as const, icon: Bell, label: 'Notifications' },
    { id: 'privacy' as const, icon: Shield, label: 'Privacy' },
    { id: 'devices' as const, icon: Smartphone, label: 'Devices' },
    { id: 'about' as const, icon: Info, label: 'About' },
  ];

  return (
    <div className="modal-overlay flex items-center justify-center p-4"
      onClick={() => setShowSettings(false)}>
      <div className="modal-content glass-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center shadow-sm">
              <Sparkles className="w-[18px] h-[18px] text-[var(--accent)]" />
            </div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Settings</h3>
          </div>
          <button onClick={() => setShowSettings(false)} className="btn-icon text-[var(--text-muted)]">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar tabs */}
          <div className="w-48 border-r border-[var(--border)] py-3 px-2 flex-shrink-0 bg-[var(--bg-app)]">
            {tabs.map(tab => (
              <button key={tab.id}
                onClick={() => setSettingsTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-0.5',
                  settingsTab === tab.id
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]'
                )}>
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scroll-thin p-6 space-y-6">
            {settingsTab === 'appearance' && (
              <div className="space-y-6 animate-fade-in">
                {/* Theme Toggle */}
                <section>
                  <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5" /> Theme
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => { if (theme === 'dark') toggleTheme(); }}
                      className={cn(
                        'p-4 rounded-xl border-2 transition-all duration-300 text-left group',
                        theme === 'light'
                          ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                          : 'border-[var(--border)] hover:border-[var(--accent-muted)]'
                      )}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300',
                          theme === 'light' ? 'bg-amber-100 text-amber-600' : 'bg-[var(--bg-wash)] text-[var(--text-muted)]'
                        )}>
                          <Sun className="w-5 h-5" />
                        </div>
                        {theme === 'light' && <CheckCircle2 className="w-4 h-4 text-[var(--accent)] ml-auto" />}
                      </div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Light</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Bright & clean</p>
                    </button>
                    <button onClick={() => { if (theme === 'light') toggleTheme(); }}
                      className={cn(
                        'p-4 rounded-xl border-2 transition-all duration-300 text-left group',
                        theme === 'dark'
                          ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                          : 'border-[var(--border)] hover:border-[var(--accent-muted)]'
                      )}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300',
                          theme === 'dark' ? 'bg-indigo-950 text-indigo-300' : 'bg-[var(--bg-wash)] text-[var(--text-muted)]'
                        )}>
                          <Moon className="w-5 h-5" />
                        </div>
                        {theme === 'dark' && <CheckCircle2 className="w-4 h-4 text-[var(--accent)] ml-auto" />}
                      </div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Dark</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Easy on the eyes</p>
                    </button>
                  </div>
                </section>

                {/* Color Scheme */}
                <section>
                  <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Palette className="w-3.5 h-3.5" /> Color Scheme
                  </h4>
                  <div className="bg-[var(--bg-app)] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-4 flex-wrap">
                      {COLOR_SCHEMES.map(scheme => (
                        <button key={scheme.id} onClick={() => setColorScheme(scheme.id)}
                          className="group flex flex-col items-center gap-1.5">
                          <div className={cn('color-swatch', colorScheme === scheme.id && 'active')}
                            style={{ background: scheme.color }} />
                          <span className={cn(
                            'text-[10px] font-medium transition-colors',
                            colorScheme === scheme.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                          )}>{scheme.name}</span>
                        </button>
                      ))}
                    </div>
                    {/* Preview */}
                    <div className="mt-4 pt-4 border-t border-[var(--border)]">
                      <p className="text-xs text-[var(--text-muted)] mb-2">Preview</p>
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-start">
                          <div className="px-3 py-2 rounded-xl rounded-bl-sm bg-[var(--bubble-other)] text-[var(--bubble-other-text)] text-xs max-w-[60%]">
                            Hey! How&apos;s it going? 👋
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className="px-3 py-2 rounded-xl rounded-br-sm bubble-own text-xs max-w-[60%]">
                            <span className="relative z-10">Great! Just testing the new theme ✨</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Chat Bubble Style */}
                <section>
                  <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5" /> Bubble Style
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {BUBBLE_STYLES.map(style => (
                      <button key={style.id} onClick={() => setBubbleStyle(style.id)}
                        className={cn(
                          'p-3 rounded-xl border-2 transition-all duration-300 text-center',
                          bubbleStyle === style.id
                            ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                            : 'border-[var(--border)] hover:border-[var(--accent-muted)]'
                        )}>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{style.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{style.desc}</p>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Font Size */}
                <section>
                  <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Type className="w-3.5 h-3.5" /> Font Size
                  </h4>
                  <div className="flex items-center gap-2 bg-[var(--bg-app)] rounded-xl p-1.5 border border-[var(--border)]">
                    {FONT_SIZES.map(size => (
                      <button key={size.id} onClick={() => setFontSize(size.id)}
                        className={cn(
                          'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200',
                          fontSize === size.id
                            ? 'bg-[var(--accent)] text-white shadow-sm'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
                        )}>
                        {size.name}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Toggles */}
                <section className="space-y-1">
                  <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Layout className="w-3.5 h-3.5" /> Layout & Effects
                  </h4>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border)]">
                    <div className="flex items-center gap-3">
                      <Layout className="w-4 h-4 text-[var(--text-muted)]" />
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">Compact Mode</p>
                        <p className="text-xs text-[var(--text-muted)]">Reduce spacing in conversations</p>
                      </div>
                    </div>
                    <Toggle active={compactMode} onChange={() => setCompactMode(!compactMode)} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border)]">
                    <div className="flex items-center gap-3">
                      <Zap className="w-4 h-4 text-[var(--text-muted)]" />
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">Animations</p>
                        <p className="text-xs text-[var(--text-muted)]">Enable smooth transitions & effects</p>
                      </div>
                    </div>
                    <Toggle active={animationsEnabled} onChange={() => setAnimationsEnabled(!animationsEnabled)} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border)]">
                    <div className="flex items-center gap-3">
                      {notificationsEnabled ? <Bell className="w-4 h-4 text-[var(--text-muted)]" /> : <BellOff className="w-4 h-4 text-[var(--text-muted)]" />}
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">Notifications</p>
                        <p className="text-xs text-[var(--text-muted)]">Desktop notifications for messages</p>
                      </div>
                    </div>
                    <Toggle active={notificationsEnabled} onChange={async () => {
                      if (!notificationsEnabled) {
                        const perm = await Notification.requestPermission();
                        setNotificationsEnabled(perm === 'granted');
                      }
                    }} />
                  </div>
                </section>
              </div>
            )}

            {settingsTab === 'notifications' && (
              <div className="space-y-4 animate-fade-in">
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5" /> Notification Settings
                </h4>

                {/* Desktop Notifications */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-app)] border border-[var(--border)] transition-all duration-200 hover:border-[var(--accent-muted)]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                      {notificationsEnabled ? <Bell className="w-4 h-4 text-[var(--accent)]" /> : <BellOff className="w-4 h-4 text-[var(--text-muted)]" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Desktop Notifications</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {notificationsEnabled ? 'Notifications are enabled' : 'Click to enable browser notifications'}
                      </p>
                    </div>
                  </div>
                  <Toggle active={notificationsEnabled} onChange={async () => {
                    if (!notificationsEnabled) {
                      const perm = await Notification.requestPermission();
                      setNotificationsEnabled(perm === 'granted');
                    }
                  }} />
                </div>

                {/* Notification Sounds */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-app)] border border-[var(--border)] transition-all duration-200 hover:border-[var(--accent-muted)]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                      <Zap className="w-4 h-4 text-[var(--accent)]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Notification Sounds</p>
                      <p className="text-xs text-[var(--text-muted)]">Play sounds for incoming messages & calls</p>
                    </div>
                  </div>
                  <Toggle active={true} onChange={() => {
                    setNotificationSoundEnabled(true);
                  }} />
                </div>

                {/* Info */}
                <div className="p-4 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-muted)]">
                  <p className="text-xs text-[var(--accent)] font-medium">Tip</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Browser notifications require permission. If you denied it previously, you can re-enable it in your browser&apos;s site settings.
                  </p>
                </div>
              </div>
            )}

            {settingsTab === 'privacy' && (
              <div className="space-y-1 animate-fade-in">
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5" /> Privacy Settings
                </h4>
                {[
                  { key: 'show_online_status', label: 'Online Status', desc: 'Show when you are online', icon: Globe },
                  { key: 'show_last_seen', label: 'Last Seen', desc: 'Show your last active time', icon: Clock },
                  { key: 'show_read_receipts', label: 'Read Receipts', desc: 'Let others see when you read messages', icon: Eye },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-app)] border border-[var(--border)] transition-all duration-200 hover:border-[var(--accent-muted)]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                        <item.icon className="w-4 h-4 text-[var(--accent)]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
                        <p className="text-xs text-[var(--text-muted)]">{item.desc}</p>
                      </div>
                    </div>
                    <Toggle active={privacy[item.key as keyof typeof privacy]} onChange={() => updatePrivacy(item.key as keyof typeof privacy, !privacy[item.key as keyof typeof privacy])} />
                  </div>
                ))}
              </div>
            )}

            {settingsTab === 'devices' && (
              <div className="animate-fade-in">
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Smartphone className="w-3.5 h-3.5" /> Connected Devices
                </h4>
                <div className="space-y-2">
                  {devices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                      <Smartphone className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-sm font-medium text-[var(--text-secondary)]">No devices found</p>
                      <p className="text-xs mt-1">Device information is not available</p>
                    </div>
                  ) : devices.map(d => (
                    <div key={d.id} className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-app)] border border-[var(--border)] transition-all duration-200 hover:border-[var(--accent-muted)]">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center',
                          d.is_current ? 'bg-[var(--accent-subtle)]' : 'bg-[var(--bg-wash)]'
                        )}>
                          <Smartphone className={cn('w-5 h-5', d.is_current ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {d.device_name || 'Unknown Device'}
                            {d.is_current && (
                              <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--accent-subtle)] text-[var(--accent)]">
                                This device
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">{d.device_type} · Last active {d.last_active}</p>
                        </div>
                      </div>
                      {!d.is_current && (
                        <button onClick={() => removeDevice(d.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {settingsTab === 'about' && (
              <div className="animate-fade-in">
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-4 bg-[var(--accent)] flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">Z</span>
                  </div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">Zynk</h3>
                  <p className="text-sm text-[var(--text-muted)]">Version 2.0.0</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Privacy-first encrypted messaging</p>
                </div>

                <div className="space-y-2 mt-4">
                  {[
                    { icon: Shield, label: 'End-to-end Encryption', desc: 'All messages are encrypted by default' },
                    { icon: Zap, label: 'Real-time Communication', desc: 'Instant messaging with WebSocket' },
                    { icon: Globe, label: 'Cross Platform', desc: 'Available on web, iOS, and Android' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border)]">
                      <div className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
                        <item.icon className="w-4 h-4 text-[var(--accent)]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
                        <p className="text-xs text-[var(--text-muted)]">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t border-[var(--border)] text-center">
                  <p className="text-xs text-[var(--text-muted)]">
                    Made with <Heart className="w-3 h-3 inline text-[var(--danger)]" /> by Zynk Team
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    &copy; {new Date().getFullYear()} Zynk. All rights reserved.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
