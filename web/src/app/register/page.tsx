'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import {
  Button, Input, Chip, Progress,
} from '@heroui/react';
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

  const CheckItem = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-1.5">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 ${ok ? 'bg-success text-white scale-100' : 'bg-default-200 text-default-400 scale-95'}`}>
        {ok ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
      </div>
      <span className={`text-xs transition-colors duration-200 ${ok ? 'text-success font-medium' : 'text-default-400'}`}>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Branding Panel */}
      <div className="relative flex items-center justify-center lg:w-[52%] w-full min-h-[260px] lg:min-h-screen overflow-hidden px-8 py-12 lg:py-0 bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700">
        {/* Decorative Elements */}
        <div className="absolute w-[300px] h-[300px] rounded-full bg-white/10 -top-12 -right-12 blur-sm" />
        <div className="absolute w-[240px] h-[240px] rounded-full bg-white/[0.06] bottom-[8%] left-[5%]" />
        <div className="absolute w-[170px] h-[170px] rounded-full bg-white/[0.04] top-[35%] right-[10%]" />
        <div className="absolute w-[120px] h-[120px] rounded-full bg-white/10 top-[12%] left-[18%] blur-[2px]" />

        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />

        <div className="relative z-10 text-center lg:text-left max-w-md animate-appear">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/10 shadow-xl">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight mb-4 leading-tight">
            Join<br />Zynk
          </h1>
          <p className="text-base lg:text-lg text-white/60 leading-relaxed max-w-sm">
            Create your private account in seconds. No email or phone required — just a username and you&apos;re in.
          </p>
          <div className="flex items-center gap-5 mt-8">
            <Chip variant="flat" size="sm" classNames={{ base: 'bg-white/10 border-white/10', content: 'text-white/70 text-xs font-medium' }} startContent={<Lock className="w-3 h-3 text-white/70" />}>
              On-Device Keys
            </Chip>
            <Chip variant="flat" size="sm" classNames={{ base: 'bg-white/10 border-white/10', content: 'text-white/70 text-xs font-medium' }} startContent={<Shield className="w-3 h-3 text-white/70" />}>
              No Data Collected
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
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Create account</h2>
            <p className="text-sm text-default-400 mt-1.5">Start messaging privately in seconds</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} autoComplete="on" className="space-y-5">
            <div>
              <Input
                label="Username"
                placeholder="Choose a username"
                variant="bordered"
                size="lg"
                radius="lg"
                value={username}
                onValueChange={setUsername}
                autoComplete="username"
                autoFocus
                isInvalid={username.length > 0 && !usernameValid}
                color={username.length > 0 ? (usernameValid ? 'success' : 'danger') : 'default'}
                startContent={<User className="w-4 h-4 text-default-400" />}
                description={username && !usernameValid ? '3-64 chars: letters, numbers, underscores' : undefined}
                classNames={{
                  inputWrapper: 'border-default-200 data-[hover=true]:border-primary/50 group-data-[focus=true]:border-primary',
                  label: 'text-default-500',
                }}
              />
            </div>

            <div>
              <Input
                label="Password"
                placeholder="Create a strong password"
                variant="bordered"
                size="lg"
                radius="lg"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onValueChange={setPassword}
                autoComplete="new-password"
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
              {password && (
                <div className="mt-3 space-y-2.5">
                  <Progress
                    size="sm"
                    value={strength * 25}
                    color={strength <= 1 ? 'danger' : strength <= 2 ? 'warning' : strength <= 3 ? 'primary' : 'success'}
                    classNames={{ indicator: 'transition-all duration-500' }}
                    aria-label="Password strength"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <CheckItem ok={checks.length} label="8+ characters" />
                    <CheckItem ok={checks.uppercase} label="Uppercase" />
                    <CheckItem ok={checks.lowercase} label="Lowercase" />
                    <CheckItem ok={checks.number} label="Number" />
                  </div>
                </div>
              )}
            </div>

            <Input
              label="Confirm Password"
              placeholder="Re-enter password"
              variant="bordered"
              size="lg"
              radius="lg"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onValueChange={setConfirmPassword}
              autoComplete="new-password"
              startContent={<Lock className="w-4 h-4 text-default-400" />}
              isInvalid={confirmPassword.length > 0 && !checks.match}
              color={confirmPassword.length > 0 ? (checks.match ? 'success' : 'danger') : 'default'}
              errorMessage={confirmPassword && !checks.match ? 'Passwords do not match' : undefined}
              classNames={{
                inputWrapper: 'border-default-200 data-[hover=true]:border-primary/50 group-data-[focus=true]:border-primary',
                label: 'text-default-500',
              }}
            />

            {/* Submit */}
            <Button
              type="submit"
              color="primary"
              size="lg"
              radius="lg"
              fullWidth
              isDisabled={!allValid}
              isLoading={loading}
              spinner={<Loader2 className="w-5 h-5 animate-spin" />}
              className="font-bold shadow-lg shadow-primary/25 text-base h-12"
              startContent={!loading && <UserPlus className="w-4 h-4" />}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-default-400 mt-8">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-semibold hover:underline underline-offset-2">
              Sign In
            </Link>
          </p>

          <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-default-400">
            <Shield className="w-3.5 h-3.5" />
            <span>Your keys are generated on-device, never shared</span>
          </div>
        </div>
      </div>
    </div>
  );
}
