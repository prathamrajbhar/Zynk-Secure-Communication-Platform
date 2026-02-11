import { create } from 'zustand';

export type ColorScheme = 'violet' | 'ocean' | 'emerald' | 'rose' | 'amber' | 'crimson';
export type ChatBubbleStyle = 'gradient' | 'solid' | 'minimal';
export type FontSize = 'small' | 'medium' | 'large';
export type ChatBackground = 'default' | 'dots' | 'grid' | 'waves' | 'gradient' | 'bubbles' | 'doodle';
export type MuteDuration = '1h' | '8h' | '1w' | 'forever';
export type SidebarFilter = 'all' | 'unread' | 'groups' | 'media';

export const COLOR_SCHEMES: { id: ColorScheme; name: string; color: string }[] = [
  { id: 'violet', name: 'Indigo', color: '#5b5fc7' },
  { id: 'ocean', name: 'Blue', color: '#1a73e8' },
  { id: 'emerald', name: 'Green', color: '#0d9e5f' },
  { id: 'rose', name: 'Pink', color: '#e8366d' },
  { id: 'amber', name: 'Amber', color: '#e68a00' },
  { id: 'crimson', name: 'Red', color: '#d93025' },
];

export const CHAT_BACKGROUNDS: { id: ChatBackground; name: string; label: string; preview: string }[] = [
  { id: 'default', name: 'Default', label: 'Default', preview: '🏠' },
  { id: 'dots', name: 'Dots', label: 'Dots', preview: '⚫' },
  { id: 'grid', name: 'Grid', label: 'Grid', preview: '🔲' },
  { id: 'waves', name: 'Waves', label: 'Waves', preview: '🌊' },
  { id: 'gradient', name: 'Gradient', label: 'Gradient', preview: '🌈' },
  { id: 'bubbles', name: 'Bubbles', label: 'Bubbles', preview: '🫧' },
  { id: 'doodle', name: 'Doodle', label: 'Doodle', preview: '✏️' },
];

interface UIState {
  theme: 'light' | 'dark';
  colorScheme: ColorScheme;
  bubbleStyle: ChatBubbleStyle;
  fontSize: FontSize;
  compactMode: boolean;
  animationsEnabled: boolean;
  sidebarOpen: boolean;
  sidebarTab: 'chats' | 'calls' | 'contacts';
  showSettings: boolean;
  showNewChat: boolean;
  showGroupCreate: boolean;
  showProfile: boolean;
  showUserInfo: boolean;
  settingsTab: 'appearance' | 'notifications' | 'privacy' | 'devices' | 'storage' | 'about';

  // New feature state
  chatBackground: ChatBackground;
  sidebarFilter: SidebarFilter;
  messageSoundEnabled: boolean;
  callSoundEnabled: boolean;
  notifSoundEnabled: boolean;

  // Actions
  toggleTheme: () => void;
  setColorScheme: (scheme: ColorScheme) => void;
  setBubbleStyle: (style: ChatBubbleStyle) => void;
  setFontSize: (size: FontSize) => void;
  setCompactMode: (compact: boolean) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: 'chats' | 'calls' | 'contacts') => void;
  setShowSettings: (show: boolean) => void;
  setShowNewChat: (show: boolean) => void;
  setShowGroupCreate: (show: boolean) => void;
  setShowProfile: (show: boolean) => void;
  setShowUserInfo: (show: boolean) => void;
  setSettingsTab: (tab: 'appearance' | 'notifications' | 'privacy' | 'devices' | 'storage' | 'about') => void;
  setChatBackground: (bg: ChatBackground) => void;
  setSidebarFilter: (filter: SidebarFilter) => void;
  setMessageSoundEnabled: (enabled: boolean) => void;
  setCallSoundEnabled: (enabled: boolean) => void;
  setNotifSoundEnabled: (enabled: boolean) => void;
  hydrateUI: () => void;
}

function applyTheme(theme: string, scheme: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.setAttribute('data-theme', scheme);
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  colorScheme: 'violet',
  bubbleStyle: 'gradient',
  fontSize: 'medium',
  compactMode: false,
  animationsEnabled: true,
  sidebarOpen: true,
  sidebarTab: 'chats',
  showSettings: false,
  showNewChat: false,
  showGroupCreate: false,
  showProfile: false,
  showUserInfo: false,
  settingsTab: 'appearance',
  chatBackground: 'default',
  sidebarFilter: 'all',
  messageSoundEnabled: true,
  callSoundEnabled: true,
  notifSoundEnabled: true,

  toggleTheme: () => {
    set(state => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme, state.colorScheme);
      localStorage.setItem('zynk-theme', newTheme);
      return { theme: newTheme };
    });
  },

  setColorScheme: (scheme) => {
    set(state => {
      applyTheme(state.theme, scheme);
      localStorage.setItem('zynk-color-scheme', scheme);
      return { colorScheme: scheme };
    });
  },

  setBubbleStyle: (style) => {
    set({ bubbleStyle: style });
    localStorage.setItem('zynk-bubble-style', style);
  },

  setFontSize: (size) => {
    set({ fontSize: size });
    localStorage.setItem('zynk-font-size', size);
  },

  setCompactMode: (compact) => {
    set({ compactMode: compact });
    localStorage.setItem('zynk-compact-mode', String(compact));
  },

  setAnimationsEnabled: (enabled) => {
    set({ animationsEnabled: enabled });
    localStorage.setItem('zynk-animations', String(enabled));
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setShowSettings: (show) => set({ showSettings: show, settingsTab: 'appearance' }),
  setShowNewChat: (show) => set({ showNewChat: show }),
  setShowGroupCreate: (show) => set({ showGroupCreate: show }),
  setShowProfile: (show) => set({ showProfile: show }),
  setShowUserInfo: (show) => set({ showUserInfo: show }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),

  setChatBackground: (bg) => {
    set({ chatBackground: bg });
    localStorage.setItem('zynk-chat-bg', bg);
  },

  setSidebarFilter: (filter) => set({ sidebarFilter: filter }),

  setMessageSoundEnabled: (enabled) => {
    set({ messageSoundEnabled: enabled });
    localStorage.setItem('zynk-msg-sound', String(enabled));
  },

  setCallSoundEnabled: (enabled) => {
    set({ callSoundEnabled: enabled });
    localStorage.setItem('zynk-call-sound', String(enabled));
  },

  setNotifSoundEnabled: (enabled) => {
    set({ notifSoundEnabled: enabled });
    localStorage.setItem('zynk-notif-sound', String(enabled));
  },

  hydrateUI: () => {
    if (typeof window === 'undefined') return;
    const theme = (localStorage.getItem('zynk-theme') || 'dark') as 'light' | 'dark';
    const colorScheme = (localStorage.getItem('zynk-color-scheme') || 'violet') as ColorScheme;
    const bubbleStyle = (localStorage.getItem('zynk-bubble-style') || 'gradient') as ChatBubbleStyle;
    const fontSize = (localStorage.getItem('zynk-font-size') || 'medium') as FontSize;
    const compactMode = localStorage.getItem('zynk-compact-mode') === 'true';
    const animationsEnabled = localStorage.getItem('zynk-animations') !== 'false';
    const chatBackground = (localStorage.getItem('zynk-chat-bg') || 'default') as ChatBackground;
    const messageSoundEnabled = localStorage.getItem('zynk-msg-sound') !== 'false';
    const callSoundEnabled = localStorage.getItem('zynk-call-sound') !== 'false';
    const notifSoundEnabled = localStorage.getItem('zynk-notif-sound') !== 'false';
    applyTheme(theme, colorScheme);
    set({ theme, colorScheme, bubbleStyle, fontSize, compactMode, animationsEnabled, chatBackground, messageSoundEnabled, callSoundEnabled, notifSoundEnabled });
  },
}));
