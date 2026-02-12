// ═══════════════════════════════════════════════════════
// ZYNK UI — Settings Panel (Discord-style)
// ═══════════════════════════════════════════════════════

'use client';

import React from 'react';
import { useUIStore, COLOR_SCHEMES, CHAT_BACKGROUNDS, type ColorScheme, type ChatBubbleStyle, type FontSize, type ChatBackground } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import {
  Palette, Bell, Shield, Monitor, HardDrive, Info, Moon, Sun,
  Check, ChevronRight, Sparkles, Maximize2, Volume2,
  Lock, Eye, Trash2, LogOut, X,
} from 'lucide-react';

export default function SettingsPanel() {
  const {
    showSettings, setShowSettings, theme, toggleTheme, colorScheme, setColorScheme,
    bubbleStyle, setBubbleStyle, fontSize, setFontSize, compactMode, setCompactMode,
    animationsEnabled, setAnimationsEnabled, chatBackground, setChatBackground,
    messageSoundEnabled, setMessageSoundEnabled, callSoundEnabled, setCallSoundEnabled,
    notifSoundEnabled, setNotifSoundEnabled, settingsTab, setSettingsTab,
  } = useUIStore();
  const { logout } = useAuthStore();

  const handleLogout = async () => {
    try { await logout(); } catch { /* force */ }
    setShowSettings(false);
  };

  const tabs = [
    { id: 'appearance' as const, icon: Palette, label: 'Appearance' },
    { id: 'notifications' as const, icon: Bell, label: 'Notifications' },
    { id: 'privacy' as const, icon: Shield, label: 'Privacy' },
    { id: 'devices' as const, icon: Monitor, label: 'Devices' },
    { id: 'storage' as const, icon: HardDrive, label: 'Storage' },
    { id: 'about' as const, icon: Info, label: 'About' },
  ];

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setShowSettings(false)}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl animate-slide-up overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-bold text-foreground">Settings</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar tabs — desktop */}
          <div className="w-44 border-r border-border py-2 flex-shrink-0 overflow-y-auto hidden sm:block">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSettingsTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors rounded-lg mx-1',
                  settingsTab === tab.id
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}

            <div className="h-px bg-border my-2 mx-3" />
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 rounded-lg mx-1 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>

          {/* Mobile tab selector */}
          <div className="sm:hidden w-full flex flex-col">
            <div className="flex overflow-x-auto gap-1 px-3 py-2 border-b border-border">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0',
                    settingsTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-accent',
                  )}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 chat-scrollbar">
            {settingsTab === 'appearance' && (
              <AppearanceSettings
                theme={theme} toggleTheme={toggleTheme}
                colorScheme={colorScheme} setColorScheme={setColorScheme}
                bubbleStyle={bubbleStyle} setBubbleStyle={setBubbleStyle}
                fontSize={fontSize} setFontSize={setFontSize}
                compactMode={compactMode} setCompactMode={setCompactMode}
                animationsEnabled={animationsEnabled} setAnimationsEnabled={setAnimationsEnabled}
                chatBackground={chatBackground} setChatBackground={setChatBackground}
              />
            )}

            {settingsTab === 'notifications' && (
              <NotificationSettings
                messageSoundEnabled={messageSoundEnabled} setMessageSoundEnabled={setMessageSoundEnabled}
                callSoundEnabled={callSoundEnabled} setCallSoundEnabled={setCallSoundEnabled}
                notifSoundEnabled={notifSoundEnabled} setNotifSoundEnabled={setNotifSoundEnabled}
              />
            )}

            {settingsTab === 'privacy' && <PrivacySettings />}
            {settingsTab === 'devices' && <DevicesSettings />}
            {settingsTab === 'storage' && <StorageSettings />}
            {settingsTab === 'about' && <AboutSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─── Appearance Tab ─── */
function AppearanceSettings({
  theme, toggleTheme, colorScheme, setColorScheme,
  bubbleStyle, setBubbleStyle, fontSize, setFontSize,
  compactMode, setCompactMode, animationsEnabled, setAnimationsEnabled,
  chatBackground, setChatBackground,
}: {
  theme: string; toggleTheme: () => void;
  colorScheme: ColorScheme; setColorScheme: (s: ColorScheme) => void;
  bubbleStyle: ChatBubbleStyle; setBubbleStyle: (s: ChatBubbleStyle) => void;
  fontSize: FontSize; setFontSize: (s: FontSize) => void;
  compactMode: boolean; setCompactMode: (c: boolean) => void;
  animationsEnabled: boolean; setAnimationsEnabled: (e: boolean) => void;
  chatBackground: ChatBackground; setChatBackground: (bg: ChatBackground) => void;
}) {
  return (
    <>
      {/* Theme toggle */}
      <SettingsSection title="Theme">
        <div className="flex gap-3">
          <ThemeCard active={theme === 'light'} onClick={toggleTheme} icon={Sun} label="Light" />
          <ThemeCard active={theme === 'dark'} onClick={toggleTheme} icon={Moon} label="Dark" />
        </div>
      </SettingsSection>

      {/* Color scheme */}
      <SettingsSection title="Accent Color">
        <div className="flex gap-2 flex-wrap">
          {COLOR_SCHEMES.map((cs) => (
            <button
              key={cs.id}
              onClick={() => setColorScheme(cs.id)}
              className={cn(
                'w-8 h-8 rounded-full transition-all ring-2 ring-offset-2 ring-offset-card',
                colorScheme === cs.id ? 'ring-primary scale-110' : 'ring-transparent hover:ring-muted-foreground/30',
              )}
              style={{ backgroundColor: cs.color }}
              title={cs.name}
              aria-label={cs.name}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Chat background */}
      <SettingsSection title="Chat Background">
        <div className="grid grid-cols-4 gap-2">
          {CHAT_BACKGROUNDS.map((bg) => (
            <button
              key={bg.id}
              onClick={() => setChatBackground(bg.id)}
              className={cn(
                'flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all',
                chatBackground === bg.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/30',
              )}
            >
              <span className="text-lg">{bg.preview}</span>
              <span className="text-[10px] text-muted-foreground">{bg.label}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Bubble style */}
      <SettingsSection title="Bubble Style">
        <div className="flex gap-2">
          {(['gradient', 'solid', 'minimal'] as ChatBubbleStyle[]).map((style) => (
            <button
              key={style}
              onClick={() => setBubbleStyle(style)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors',
                bubbleStyle === style
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-accent',
              )}
            >
              {style}
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Font size */}
      <SettingsSection title="Font Size">
        <div className="flex gap-2">
          {(['small', 'medium', 'large'] as FontSize[]).map((size) => (
            <button
              key={size}
              onClick={() => setFontSize(size)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors',
                fontSize === size
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-accent',
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Toggles */}
      <SettingsSection title="Preferences">
        <ToggleRow icon={Maximize2} label="Compact Mode" checked={compactMode} onChange={setCompactMode} />
        <ToggleRow icon={Sparkles} label="Animations" checked={animationsEnabled} onChange={setAnimationsEnabled} />
      </SettingsSection>
    </>
  );
}


/* ─── Notifications Tab ─── */
function NotificationSettings({
  messageSoundEnabled, setMessageSoundEnabled,
  callSoundEnabled, setCallSoundEnabled,
  notifSoundEnabled, setNotifSoundEnabled,
}: {
  messageSoundEnabled: boolean; setMessageSoundEnabled: (e: boolean) => void;
  callSoundEnabled: boolean; setCallSoundEnabled: (e: boolean) => void;
  notifSoundEnabled: boolean; setNotifSoundEnabled: (e: boolean) => void;
}) {
  return (
    <SettingsSection title="Sound Settings">
      <ToggleRow icon={Volume2} label="Message Sounds" checked={messageSoundEnabled} onChange={setMessageSoundEnabled} />
      <ToggleRow icon={Volume2} label="Call Ringtone" checked={callSoundEnabled} onChange={setCallSoundEnabled} />
      <ToggleRow icon={Volume2} label="Notification Sounds" checked={notifSoundEnabled} onChange={setNotifSoundEnabled} />
    </SettingsSection>
  );
}


/* ─── Privacy Tab ─── */
function PrivacySettings() {
  return (
    <>
      <SettingsSection title="Privacy">
        <div className="space-y-3">
          <PrivacyRow icon={Eye} label="Last Seen" value="Everyone" />
          <PrivacyRow icon={Lock} label="Profile Photo" value="Everyone" />
          <PrivacyRow icon={Info} label="About" value="Everyone" />
        </div>
      </SettingsSection>

      <SettingsSection title="Security">
        <div className="flex gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
          <Lock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">End-to-End Encryption</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              All messages, calls, and files are encrypted with 256-bit AES. Not even Zynk can read your data.
            </p>
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

function PrivacyRow({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <button className="w-full flex items-center justify-between py-2 hover:bg-secondary rounded-lg px-2 -mx-2 transition-colors">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">{value}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );
}


/* ─── Devices Tab ─── */
function DevicesSettings() {
  return (
    <SettingsSection title="Active Devices">
      <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary border border-border">
        <Monitor className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Current Device</p>
          <p className="text-xs text-muted-foreground mt-0.5">Web Browser · Active now</p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success">
          Current
        </span>
      </div>
    </SettingsSection>
  );
}


/* ─── Storage Tab ─── */
function StorageSettings() {
  return (
    <SettingsSection title="Storage Usage">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Cached Messages</span>
          <span className="text-sm font-medium text-foreground">—</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Encryption Keys</span>
          <span className="text-sm font-medium text-foreground">Stored locally</span>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-destructive bg-destructive/10 rounded-lg hover:bg-destructive/20 transition-colors mt-2">
          <Trash2 className="w-4 h-4" />
          Clear Cache
        </button>
      </div>
    </SettingsSection>
  );
}


/* ─── About Tab ─── */
function AboutSettings() {
  return (
    <SettingsSection title="About Zynk">
      <div className="text-center py-4">
        <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center mx-auto mb-3 shadow-lg shadow-primary/20">
          <Shield className="w-7 h-7 text-white" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Zynk</h3>
        <p className="text-xs text-muted-foreground mt-1">Version 1.0.0</p>
        <p className="text-sm text-muted-foreground mt-3 max-w-xs mx-auto leading-relaxed">
          Privacy-first encrypted messaging, voice &amp; video calls, and file sharing.
        </p>
      </div>
    </SettingsSection>
  );
}


/* ─── Shared Components ─── */
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ThemeCard({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: typeof Sun; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all',
        active
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/30',
      )}
    >
      <Icon className={cn('w-5 h-5', active ? 'text-primary' : 'text-muted-foreground')} />
      <span className={cn('text-sm font-semibold', active ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </span>
      {active && <Check className="w-4 h-4 text-primary ml-auto" />}
    </button>
  );
}

function ToggleRow({ icon: Icon, label, checked, onChange }: {
  icon: typeof Sparkles; label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
          checked ? 'bg-primary' : 'bg-muted',
        )}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}
