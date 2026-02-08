import { create } from 'zustand';

interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  sidebarTab: 'chats' | 'calls';
  showSettings: boolean;
  showNewChat: boolean;
  showGroupCreate: boolean;
  showProfile: boolean;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: 'chats' | 'calls') => void;
  setShowSettings: (show: boolean) => void;
  setShowNewChat: (show: boolean) => void;
  setShowGroupCreate: (show: boolean) => void;
  setShowProfile: (show: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  sidebarOpen: true,
  sidebarTab: 'chats',
  showSettings: false,
  showNewChat: false,
  showGroupCreate: false,
  showProfile: false,

  toggleTheme: () => {
    set(state => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
      }
      localStorage.setItem('theme', newTheme);
      return { theme: newTheme };
    });
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowNewChat: (show) => set({ showNewChat: show }),
  setShowGroupCreate: (show) => set({ showGroupCreate: show }),
  setShowProfile: (show) => set({ showProfile: show }),
}));

