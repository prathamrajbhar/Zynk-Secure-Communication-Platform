'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { Shield, Eye, EyeOff, Loader2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const router = useRouter();

  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    match: password === confirmPassword && password.length > 0,
  };

  const usernameValid = /^[a-zA-Z0-9_]{3,64}$/.test(username);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!usernameValid) {
      toast.error('Username must be 3-64 characters (letters, numbers, underscores)');
      return;
    }
    if (!passwordChecks.length) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (!passwordChecks.match) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await register(username, password);
      toast.success('Account created successfully!');
      router.push('/chat');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const CheckItem = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-1.5 text-xs">
      {ok ? <Check className="w-3 h-3 text-green-500" /> : <X className="w-3 h-3 text-[var(--text-muted)]" />}
      <span className={ok ? 'text-green-500' : 'text-[var(--text-muted)]'}>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <Shield className="w-10 h-10 text-zynk-500" />
            <span className="text-2xl font-bold text-[var(--text-primary)]">Zynk</span>
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Create your account</h1>
          <p className="text-[var(--text-secondary)] mt-1">No email or phone number required</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="Choose a username"
              autoFocus
            />
            {username && (
              <p className={`text-xs mt-1 ${usernameValid ? 'text-green-500' : 'text-red-400'}`}>
                {usernameValid ? '✓ Valid username' : 'Must be 3-64 chars: letters, numbers, underscores'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pr-10"
                placeholder="Create a strong password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password && (
              <div className="mt-2 grid grid-cols-2 gap-1">
                <CheckItem ok={passwordChecks.length} label="8+ characters" />
                <CheckItem ok={passwordChecks.uppercase} label="Uppercase" />
                <CheckItem ok={passwordChecks.lowercase} label="Lowercase" />
                <CheckItem ok={passwordChecks.number} label="Number" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              placeholder="Re-enter your password"
            />
            {confirmPassword && (
              <p className={`text-xs mt-1 ${passwordChecks.match ? 'text-green-500' : 'text-red-400'}`}>
                {passwordChecks.match ? '✓ Passwords match' : 'Passwords do not match'}
              </p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-[var(--text-secondary)]">
            Already have an account?{' '}
            <Link href="/login" className="text-zynk-500 hover:text-zynk-400 font-medium">
              Sign in
            </Link>
          </p>
        </form>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          🔒 Anonymous signup. No personal information required.
        </p>
      </div>
    </div>
  );
}
