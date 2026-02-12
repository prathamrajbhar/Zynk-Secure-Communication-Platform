'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { Eye, EyeOff, Loader2, ArrowRight, Shield, Lock, User } from 'lucide-react';
import { showToast } from '@/components/ui';
import DeviceLimitModal from '@/components/DeviceLimitModal';

interface DeviceInfo {
  id: string;
  device_name: string;
  platform: string;
  last_active_at: string;
  created_at: string;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deviceLimitDevices, setDeviceLimitDevices] = useState<DeviceInfo[] | null>(null);
  const [maxDevices, setMaxDevices] = useState(5);
  const [forceLoginLoading, setForceLoginLoading] = useState(false);
  const { login, forceLogin } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { showToast('error', 'Please fill in all fields'); return; }
    setLoading(true);
    try {
      await login(username, password);
      showToast('success', 'Welcome back!');
      router.push('/chat');
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { error?: string; code?: string; devices?: DeviceInfo[]; max_devices?: number } } };
      if (err.response?.status === 403 && err.response?.data?.code === 'MAX_DEVICES_REACHED' && err.response?.data?.devices) {
        setDeviceLimitDevices(err.response.data.devices);
        if (err.response.data.max_devices) setMaxDevices(err.response.data.max_devices);
      } else {
        showToast('error', err.response?.data?.error || 'Login failed');
      }
    } finally { setLoading(false); }
  };

  const handleForceLogin = async (removeDeviceId: string) => {
    setForceLoginLoading(true);
    try {
      await forceLogin(username, password, removeDeviceId);
      setDeviceLimitDevices(null);
      showToast('success', 'Signed in successfully!');
      router.push('/chat');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      showToast('error', err.response?.data?.error || 'Failed to remove device and sign in');
    } finally { setForceLoginLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left — Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/80 to-primary/60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_transparent_50%,_rgba(9,9,11,0.6)_100%)]" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }} />

        <div className="relative z-10 text-center max-w-md px-8 animate-appear">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 mb-8">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">Zynk</h1>
          <p className="text-white/80 text-lg leading-relaxed mb-8">
            Private messaging with military-grade encryption. Your conversations belong to you.
          </p>
          <div className="flex items-center justify-center gap-6 text-white/60 text-sm">
            {['End-to-End Encrypted', 'Open Source', 'Zero Knowledge'].map((feature) => (
              <div key={feature} className="flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
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
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Zynk</h1>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Welcome back</h2>
          <p className="text-muted-foreground mb-8">Sign in to continue your secure conversations</p>

          {/* Form */}
          <form onSubmit={handleSubmit} autoComplete="on" className="space-y-5">
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  className="w-full h-12 pl-10 pr-4 bg-secondary border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
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
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-secondary text-primary focus:ring-primary/40 focus:ring-2"
                />
                <span className="text-sm text-muted-foreground">Remember me</span>
              </label>
              <button type="button" className="text-primary text-sm font-medium hover:underline underline-offset-2">
                Forgot Password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Signing in...</>
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* SSO */}
            <button
              type="button"
              onClick={() => showToast('info', 'SSO coming soon')}
              className="w-full h-12 bg-secondary border border-border text-foreground font-semibold rounded-xl hover:bg-accent transition-colors"
            >
              Sign in with SSO
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary font-semibold hover:underline underline-offset-2">
              Sign Up
            </Link>
          </p>

          <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5" />
            <span>Secured with end-to-end encryption</span>
          </div>
        </div>
      </div>

      {/* Device Limit Modal */}
      {deviceLimitDevices && (
        <DeviceLimitModal
          devices={deviceLimitDevices}
          maxDevices={maxDevices}
          onRemoveAndLogin={handleForceLogin}
          onCancel={() => setDeviceLimitDevices(null)}
          loading={forceLoginLoading}
        />
      )}
    </div>
  );
}
