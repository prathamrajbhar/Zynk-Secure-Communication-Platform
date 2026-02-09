'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { Eye, EyeOff, Loader2, Check, X, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const { register } = useAuthStore();
  const router = useRouter();

  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    match: password === confirmPassword && password.length > 0,
  };

  const usernameValid = /^[a-zA-Z0-9_]{3,64}$/.test(username);
  const allValid = checks.length && checks.uppercase && checks.lowercase && checks.number && checks.match && usernameValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameValid) { toast.error('Username must be 3-64 characters (letters, numbers, underscores)'); return; }
    if (!checks.length) { toast.error('Password must be at least 8 characters'); return; }
    if (!checks.match) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await register(username, password);
      toast.success('Account created!');
      router.push('/chat');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally { setLoading(false); }
  };

  const CheckItem = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-1.5">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 ${ok ? 'bg-[var(--success)] text-white scale-100' : 'bg-[var(--bg-wash)] text-[var(--text-muted)] scale-95'}`}>
        {ok ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
      </div>
      <span className={`text-xs transition-colors duration-200 ${ok ? 'text-[var(--success)] font-medium' : 'text-[var(--text-muted)]'}`}>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen auth-bg flex items-center justify-center px-4 py-8">
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Create account</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1.5">No email or phone — just pick a username</p>
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
                placeholder="Choose a username"
                autoFocus
              />
              {username && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 ${usernameValid ? 'bg-[var(--success)] text-white' : 'bg-red-500 text-white'}`}>
                    {usernameValid ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                  </div>
                  <p className={`text-xs ${usernameValid ? 'text-[var(--success)]' : 'text-red-400'}`}>
                    {usernameValid ? 'Looks good' : '3-64 chars: letters, numbers, underscores'}
                  </p>
                </div>
              )}
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
                  placeholder="Create a password"
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
              {password && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  <CheckItem ok={checks.length} label="8+ chars" />
                  <CheckItem ok={checks.uppercase} label="Uppercase" />
                  <CheckItem ok={checks.lowercase} label="Lowercase" />
                  <CheckItem ok={checks.number} label="Number" />
                </div>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 tracking-wide uppercase transition-colors duration-150 ${focused === 'confirm' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
                className="input-modern"
                placeholder="Re-enter password"
              />
              {confirmPassword && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 ${checks.match ? 'bg-[var(--success)] text-white' : 'bg-red-500 text-white'}`}>
                    {checks.match ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                  </div>
                  <p className={`text-xs ${checks.match ? 'text-[var(--success)]' : 'text-red-400'}`}>
                    {checks.match ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !allValid}
              className="btn-primary btn-shimmer w-full py-3 !rounded-xl text-sm font-bold mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Create Account
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-[var(--text-muted)] mt-6 animate-appear stagger-2 animate-fill">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--accent)] font-semibold hover:underline underline-offset-2 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
