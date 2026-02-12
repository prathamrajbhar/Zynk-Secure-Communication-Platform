'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import {
  Button, Input,
  Checkbox, Divider, Chip,
} from '@heroui/react';
import { Eye, EyeOff, Loader2, ArrowRight, Shield, Lock, MessageCircle, User } from 'lucide-react';
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
      {/* Left Branding Panel */}
      <div className="relative flex items-center justify-center lg:w-[52%] w-full min-h-[260px] lg:min-h-screen overflow-hidden px-8 py-12 lg:py-0 bg-gradient-to-br from-violet-600 via-primary to-indigo-700">
        {/* Decorative Elements */}
        <div className="absolute w-[360px] h-[360px] rounded-full bg-white/10 -bottom-20 -left-20 blur-sm" />
        <div className="absolute w-[220px] h-[220px] rounded-full bg-white/[0.06] top-[12%] right-[8%]" />
        <div className="absolute w-[150px] h-[150px] rounded-full bg-white/[0.04] top-[50%] left-[15%]" />
        <div className="absolute w-[100px] h-[100px] rounded-full bg-white/10 bottom-[18%] right-[12%] blur-[2px]" />

        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />

        <div className="relative z-10 text-center lg:text-left max-w-md animate-appear">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/10 shadow-xl">
              <MessageCircle className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight mb-4 leading-tight">
            Welcome<br />Back
          </h1>
          <p className="text-base lg:text-lg text-white/60 leading-relaxed max-w-sm">
            Your conversations are waiting. Pick up right where you left off — securely and privately.
          </p>
          <div className="flex items-center gap-5 mt-8">
            <Chip variant="flat" size="sm" classNames={{ base: 'bg-white/10 border-white/10', content: 'text-white/70 text-xs font-medium' }} startContent={<Lock className="w-3 h-3 text-white/70" />}>
              E2E Encrypted
            </Chip>
            <Chip variant="flat" size="sm" classNames={{ base: 'bg-white/10 border-white/10', content: 'text-white/70 text-xs font-medium' }} startContent={<Shield className="w-3 h-3 text-white/70" />}>
              Zero Knowledge
            </Chip>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-10 lg:py-0">
        <div className="w-full max-w-[420px] animate-appear stagger-1">
          {/* Logo + Header */}
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-6 group" aria-label="Go to home page">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 transition-transform duration-200 group-hover:scale-105">
                <span className="text-primary-foreground text-xs font-black">Z</span>
              </div>
              <span className="text-lg font-black text-foreground tracking-tight">Zynk</span>
            </Link>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Sign in</h2>
            <p className="text-sm text-default-400 mt-1.5">Enter your credentials to access your account</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} autoComplete="on" className="space-y-5">
            <Input
              label="Username"
              placeholder="Enter your username"
              variant="bordered"
              size="lg"
              radius="lg"
              value={username}
              onValueChange={setUsername}
              autoComplete="username"
              autoFocus
              startContent={<User className="w-4 h-4 text-default-400" />}
              classNames={{
                inputWrapper: 'border-default-200 data-[hover=true]:border-primary/50 group-data-[focus=true]:border-primary',
                label: 'text-default-500',
              }}
            />

            <Input
              label="Password"
              placeholder="Enter your password"
              variant="bordered"
              size="lg"
              radius="lg"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onValueChange={setPassword}
              autoComplete="current-password"
              startContent={<Lock className="w-4 h-4 text-default-400" />}
              endContent={
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="focus:outline-none" tabIndex={-1}>
                  {showPassword
                    ? <EyeOff className="w-4 h-4 text-default-400 hover:text-foreground transition-colors" />
                    : <Eye className="w-4 h-4 text-default-400 hover:text-foreground transition-colors" />
                  }
                </button>
              }
              classNames={{
                inputWrapper: 'border-default-200 data-[hover=true]:border-primary/50 group-data-[focus=true]:border-primary',
                label: 'text-default-500',
              }}
            />

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <Checkbox size="sm" classNames={{ label: 'text-sm text-default-500' }}>
                Remember me
              </Checkbox>
              <button type="button" className="text-primary text-sm font-medium hover:underline underline-offset-2">
                Forgot Password?
              </button>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              color="primary"
              size="lg"
              radius="lg"
              fullWidth
              isLoading={loading}
              spinner={<Loader2 className="w-5 h-5 animate-spin" />}
              className="font-bold shadow-lg shadow-primary/25 text-base h-12"
              endContent={!loading && <ArrowRight className="w-4 h-4" />}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <Divider className="flex-1" />
              <span className="text-xs text-default-400 font-medium uppercase tracking-wider">Or</span>
              <Divider className="flex-1" />
            </div>

            {/* SSO */}
            <Button
              variant="bordered"
              size="lg"
              radius="lg"
              fullWidth
              className="font-semibold border-default-200 h-12"
              onPress={() => showToast('info', 'SSO coming soon')}
            >
              Sign in with SSO
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-default-400 mt-8">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary font-semibold hover:underline underline-offset-2">
              Sign Up
            </Link>
          </p>

          <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-default-400">
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
