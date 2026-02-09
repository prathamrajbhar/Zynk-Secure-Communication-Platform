'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { MessageCircle, Video, Lock, ArrowRight, Zap, Shield, Globe, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { isAuthenticated, hydrate } = useAuthStore();
  const router = useRouter();

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { if (isAuthenticated) router.push('/chat'); }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col overflow-auto relative">
      {/* Background */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="hero-grid" />

      {/* Nav */}
      <header className="px-6 lg:px-16 py-4 flex justify-between items-center relative z-10 animate-appear">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center">
            <span className="text-white text-sm font-extrabold">Z</span>
          </div>
          <span className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight">Zynk</span>
        </div>
        <div className="flex gap-2 items-center">
          <Link href="/login" className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)] transition-all">
            Sign In
          </Link>
          <Link href="/register" className="btn-primary btn-shimmer text-sm px-5 py-2 !rounded-lg inline-flex items-center gap-1.5 font-semibold">
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 relative z-10">
        <div className="max-w-2xl text-center py-12">
          {/* Badge */}
          <div className="animate-appear stagger-1 animate-fill">
            <div className="badge-accent inline-flex mx-auto mb-8">
              <Lock className="w-3.5 h-3.5" />
              <span>End-to-end encrypted</span>
              <ChevronRight className="w-3 h-3 opacity-50" />
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[var(--text-primary)] mb-5 leading-[1.1] tracking-tight animate-appear stagger-2 animate-fill">
            The future of<br />
            <span className="gradient-text-animated">private messaging</span>
          </h1>

          <p className="text-base sm:text-lg text-[var(--text-secondary)] mb-10 max-w-md mx-auto leading-relaxed animate-appear stagger-3 animate-fill">
            Messaging, voice &amp; video calls, and file sharing — all encrypted by default. No compromises.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-appear stagger-4 animate-fill">
            <Link href="/register" className="btn-primary btn-shimmer text-sm px-7 py-3 !rounded-xl inline-flex items-center gap-2 font-semibold">
              Start Messaging <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/login" className="btn-secondary text-sm px-7 py-3 !rounded-xl inline-flex items-center gap-2">
              Learn More
            </Link>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 sm:gap-14 mt-14 animate-appear stagger-5 animate-fill">
            {[
              { num: '256-bit', label: 'AES Encryption' },
              { num: 'Zero', label: 'Knowledge Arch.' },
              { num: '100%', label: 'Open Protocol' },
            ].map(stat => (
              <div key={stat.label} className="stat-card">
                <div className="stat-number">{stat.num}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="grid sm:grid-cols-3 gap-4 mt-16">
            {[
              { icon: MessageCircle, title: 'Encrypted Chat', desc: 'Every message is end-to-end encrypted. Only you and the recipient can read them.' },
              { icon: Video, title: 'Secure Calls', desc: 'Crystal-clear voice & video calls with full encryption. No eavesdropping.' },
              { icon: Zap, title: 'Zero Knowledge', desc: "We can't read your messages, listen to your calls, or access your files." },
            ].map((item, i) => (
              <div key={item.title}
                className={`card-interactive glow-card bg-[var(--bg-surface)] rounded-xl p-5 text-left border border-[var(--border)] animate-appear animate-fill stagger-${i + 4}`}>
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center mb-4">
                    <item.icon className="w-5 h-5 text-[var(--accent)]" />
                  </div>
                  <h3 className="font-bold text-[var(--text-primary)] mb-1.5 text-sm">{item.title}</h3>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Trust */}
          <div className="mt-20 mb-6 animate-appear stagger-6 animate-fill">
            <div className="flex items-center justify-center gap-6 text-[var(--text-muted)]">
              {[
                { icon: Shield, label: 'SOC 2' },
                { icon: Lock, label: 'GDPR' },
                { icon: Globe, label: 'Open Source' },
              ].map((item, i) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  {i > 0 && <div className="w-px h-3.5 bg-[var(--border)] -ml-3 mr-3" />}
                  <item.icon className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-5 text-center text-xs text-[var(--text-muted)] relative z-10">
        &copy; {new Date().getFullYear()} Zynk &middot; Privacy-first communication
      </footer>
    </div>
  );
}
