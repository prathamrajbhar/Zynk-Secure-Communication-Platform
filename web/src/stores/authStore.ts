import { create } from 'zustand';
import api from '@/lib/api';
import { useCryptoStore } from '@/stores/cryptoStore';

interface User {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  privacy_settings?: Record<string, boolean>;
  created_at?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  forceLogin: (username: string, password: string, removeDeviceId: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('session_token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, isAuthenticated: true, isLoading: false });

        // Initialize E2EE crypto layer
        if (user.id) {
          useCryptoStore.getState().initialize(user.id).catch(err => {
            console.error('[E2EE] Page hydration initialization failed:', err);
          });
        }
      } catch {
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },

  login: async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { user_id, session_token, refresh_token } = res.data;
    localStorage.setItem('session_token', session_token);
    localStorage.setItem('refresh_token', refresh_token);

    // Fetch full user profile
    const userRes = await api.get('/auth/me');
    const user = { id: user_id, ...userRes.data };
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });

    // Initialize E2EE
    try {
      await useCryptoStore.getState().initialize(user_id);
    } catch (error) {
      console.error('E2EE initialization failed:', error);
    }
  },

  forceLogin: async (username, password, removeDeviceId) => {
    const res = await api.post('/auth/force-login', {
      username,
      password,
      remove_device_id: removeDeviceId,
    });
    const { user_id, session_token, refresh_token } = res.data;
    localStorage.setItem('session_token', session_token);
    localStorage.setItem('refresh_token', refresh_token);

    // Fetch full user profile
    const userRes = await api.get('/auth/me');
    const user = { id: user_id, ...userRes.data };
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });

    // Initialize E2EE
    try {
      await useCryptoStore.getState().initialize(user_id);
    } catch (error) {
      console.error('E2EE initialization failed:', error);
    }
  },

  register: async (username, password) => {
    const res = await api.post('/auth/register', { username, password });
    const { user_id, session_token, refresh_token } = res.data;
    localStorage.setItem('session_token', session_token);
    localStorage.setItem('refresh_token', refresh_token);

    const user = { id: user_id, username };
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });

    // Generate and upload E2EE keys on first registration
    try {
      await useCryptoStore.getState().initialize(user_id);
    } catch (error) {
      console.error('E2EE key generation failed:', error);
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch { }
    // Clear E2EE state
    useCryptoStore.getState().cleanup();
    localStorage.removeItem('session_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    set({ user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    try {
      const res = await api.get('/auth/me');
      const user = { id: res.data.id, ...res.data };
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  updateProfile: async (data) => {
    await api.put('/users/me', data);
    const currentUser = get().user;
    if (currentUser) {
      const updated = { ...currentUser, ...data };
      localStorage.setItem('user', JSON.stringify(updated));
      set({ user: updated });
    }
  },
}));
