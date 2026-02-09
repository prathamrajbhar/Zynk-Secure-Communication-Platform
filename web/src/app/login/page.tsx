'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const { login } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { toast.error('Please fill in all fields'); return; }
    setLoading(true);
    try {
      await login(username, password);
      toast.success('Welcome back!');
      router.push('/chat');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen auth-bg flex items-center justify-center px-4 py-8">
      {/* Subtle top glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-[var(--accent)] opacity-[0.04] blur-[100px] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo */}
        <div className="text-center mb-10 animate-appear">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-8 group">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center shadow-lg transition-transform duration-200 group-hover:scale-105">
              <span className="text-white text-sm font-extrabold tracking-tight">Z</span>
            </div>
            <span className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">Zynk</span>
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Welcome back</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1.5">Sign in to continue your conversations</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="animate-appear stagger-1 animate-fill">
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)] p-6 space-y-4 shadow-soft">
            {/* Username */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 tracking-wide uppercase transition-colors duration-150 ${focused === 'username' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocused('username')}
                onBlur={() => setFocused(null)}
                className="input-modern"
                placeholder="Enter your username"
                autoComplete="username"
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 tracking-wide uppercase transition-colors duration-150 ${focused === 'password' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  className="input-modern pr-11"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover)] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn-primary btn-shimmer w-full py-3 !rounded-xl text-sm font-bold mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-[var(--text-muted)] mt-6 animate-appear stagger-2 animate-fill">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[var(--accent)] font-semibold hover:underline underline-offset-2 transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
