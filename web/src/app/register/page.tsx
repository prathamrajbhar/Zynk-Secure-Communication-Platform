'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { ProgressBar } from '@/components/ui';
import { Eye, EyeOff, Loader2, Check, X, UserPlus, Shield, Lock, Sparkles, User } from 'lucide-react';
import { showToast } from '@/components/ui';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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
  const strength = [checks.length, checks.uppercase, checks.lowercase, checks.number].filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameValid) { showToast('error', 'Username must be 3-64 characters (letters, numbers, underscores)'); return; }
    if (!checks.length) { showToast('error', 'Password must be at least 8 characters'); return; }
    if (!checks.match) { showToast('error', 'Passwords do not match'); return; }
    setLoading(true);
    try {
      await register(username, password);
      showToast('success', 'Account created!');
      router.push('/chat');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      showToast('error', err.response?.data?.error || 'Registration failed');
    } finally { setLoading(false); }
  };

  const strengthVariant = strength <= 1 ? 'danger' : strength <= 2 ? 'default' : strength <= 3 ? 'accent' : 'success';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left — Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/80 to-primary/60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_transparent_50%,_rgba(9,9,11,0.6)_100%)]" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }} />

        <div className="relative z-10 text-center max-w-md px-8 animate-appear">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 mb-8">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">Join Zynk</h1>
          <p className="text-white/80 text-lg leading-relaxed mb-8">
            Create your private account in seconds. No email or phone required — just a username.
          </p>
          <div className="flex items-center justify-center gap-6 text-white/60 text-sm">
            {['On-Device Keys', 'No Data Collected', 'Open Source'].map((feature) => (
              <div key={feature} className="flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Form Panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-10 lg:py-0">
        <div className="w-full max-w-sm animate-appear">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 mb-4">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Zynk</h1>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Create account</h2>
          <p className="text-muted-foreground mb-8">Start messaging privately in seconds</p>

          {/* Form */}
          <form onSubmit={handleSubmit} autoComplete="on" className="space-y-5">
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="reg-username" className="text-sm font-medium text-foreground">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="reg-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  autoComplete="username"
                  autoFocus
                  className={`w-full h-12 pl-10 pr-4 bg-secondary border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all ${
                    username.length > 0 ? (usernameValid ? 'border-success' : 'border-destructive') : 'border-border focus:border-primary'
                  }`}
                />
              </div>
              {username && !usernameValid && (
                <p className="text-xs text-destructive">3-64 chars: letters, numbers, underscores</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  className="w-full h-12 pl-10 pr-12 bg-secondary border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && (
                <div className="mt-3 space-y-2.5">
                  <ProgressBar value={strength} max={4} variant={strengthVariant} size="sm" animated />
                  <div className="grid grid-cols-2 gap-1.5">
                    <CheckItem ok={checks.length} label="8+ characters" />
                    <CheckItem ok={checks.uppercase} label="Uppercase" />
                    <CheckItem ok={checks.lowercase} label="Lowercase" />
                    <CheckItem ok={checks.number} label="Number" />
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label htmlFor="reg-confirm" className="text-sm font-medium text-foreground">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className={`w-full h-12 pl-10 pr-4 bg-secondary border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all ${
                    confirmPassword.length > 0 ? (checks.match ? 'border-success' : 'border-destructive') : 'border-border focus:border-primary'
                  }`}
                />
              </div>
              {confirmPassword && !checks.match && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!allValid || loading}
              className="w-full h-12 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Creating account...</>
              ) : (
                <><UserPlus className="w-4 h-4" /> Create Account</>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-semibold hover:underline underline-offset-2">
              Sign In
            </Link>
          </p>

          <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5" />
            <span>Your keys are generated on-device, never shared</span>
          </div>
        </div>
      </div>
    </div>
  );
}


function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 ${ok ? 'bg-success text-white scale-100' : 'bg-secondary text-muted-foreground scale-95'}`}>
        {ok ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
      </div>
      <span className={`text-xs transition-colors duration-200 ${ok ? 'text-success font-medium' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );
}
