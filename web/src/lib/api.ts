import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// Calculate exponential backoff delay
const getRetryDelay = (retryCount: number) => RETRY_DELAY_MS * Math.pow(2, retryCount);

// Track pending refresh promise to avoid multiple refresh calls
let refreshPromise: Promise<string | null> | null = null;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('session_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean; _retryCount?: number };

    // Handle 401 - attempt to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // If already refreshing, wait for completion
        if (refreshPromise) {
          const token = await refreshPromise;
          if (token && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        }

        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          // Clear storage and redirect
          localStorage.removeItem('session_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(error);
        }

        // Create refresh promise
        refreshPromise = (async () => {
          try {
            const res = await axios.post(
              `${API_URL}/auth/refresh`,
              {},
              { headers: { Authorization: `Bearer ${refreshToken}` } }
            );
            const newToken = res.data.session_token;
            localStorage.setItem('session_token', newToken);
            if (res.data.refresh_token) {
              localStorage.setItem('refresh_token', res.data.refresh_token);
            }
            return newToken;
          } catch {
            localStorage.removeItem('session_token');
            localStorage.removeItem('refresh_token');
            window.location.href = '/login';
            return null;
          } finally {
            refreshPromise = null;
          }
        })();

        const newToken = await refreshPromise;
        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    // Retry logic for retryable errors
    const retryCount = originalRequest._retryCount || 0;
    const shouldRetry = (
      !originalRequest._retry && // Not a token refresh retry
      retryCount < MAX_RETRIES &&
      (
        !error.response || // Network errors
        RETRYABLE_STATUS_CODES.includes(error.response.status)
      )
    );

    if (shouldRetry) {
      originalRequest._retryCount = retryCount + 1;
      const delay = getRetryDelay(retryCount);

      console.log(`Retrying request (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${delay}ms`);

      await new Promise(resolve => setTimeout(resolve, delay));
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

// Helper to create an AbortController with timeout
export function createTimeoutController(timeoutMs: number = 30000): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
}

// Helper for requests that should not be retried
export async function apiNoRetry<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await api({ ...config, _retry: true } as AxiosRequestConfig & { _retry: boolean });
  return response.data;
}

export default api;
