'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import {
  MessageCircle, Video, Lock, ArrowRight, Zap, Shield, Globe,
  Users, Fingerprint, Sparkles, Wifi, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { isAuthenticated, hydrate } = useAuthStore();
  const router = useRouter();

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { if (isAuthenticated) router.push('/chat'); }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-auto relative">
      {/* Subtle gradient overlay */}
      <div className="fixed inset-0 pointer-events-none gradient-brand-subtle opacity-40" />
      <div className="fixed inset-0 pointer-events-none auth-grid-pattern opacity-30" />

      {/* Skip to content */}
      <a href="#hero" className="sr-only focus:not-sr-only fixed top-2 left-2 z-[100] bg-primary text-primary-foreground px-3 py-1 rounded">Skip to content</a>

      {/* Navbar */}
      <nav className="sticky top-0 z-40 bg-background/70 backdrop-blur-xl backdrop-saturate-150 border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 lg:px-10 h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-extrabold text-foreground tracking-tight">Zynk</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main id="hero" className="flex-1 flex items-center justify-center px-6 relative z-10">
        <div className="max-w-2xl text-center py-16">
          {/* Badge */}
          <div className="animate-appear">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-8">
              <Lock className="w-3 h-3" />
              End-to-end encrypted
              <ChevronRight className="w-3 h-3 opacity-50" />
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-foreground mb-5 leading-[1.08] tracking-tight animate-appear">
            The future of<br />
            <span className="gradient-text-animated">private messaging</span>
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground mb-10 max-w-md mx-auto leading-relaxed animate-appear">
            Messaging, voice &amp; video calls, and file sharing — all encrypted by default. No compromises.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-appear">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
            >
              Start Messaging
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center px-8 py-3 border-2 border-border text-foreground font-semibold rounded-xl hover:bg-secondary transition-colors"
            >
              Learn More
            </Link>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 sm:gap-14 mt-14 animate-appear">
            {[
              { num: '256-bit', label: 'AES Encryption' },
              { num: 'Zero', label: 'Knowledge Arch.' },
              { num: '100%', label: 'Open Protocol' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-xl sm:text-2xl font-black text-foreground">{stat.num}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground font-medium mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Feature Cards */}
          <div className="grid sm:grid-cols-3 gap-4 mt-16 animate-appear">
            {[
              {
                icon: MessageCircle,
                title: 'Encrypted Chat',
                desc: 'Every message end-to-end encrypted with X25519 + AES-256-GCM.',
                color: 'text-violet-400',
                bg: 'bg-violet-500/10 border border-violet-500/20',
              },
              {
                icon: Video,
                title: 'Secure Calls',
                desc: 'Crystal-clear voice & video calls with SRTP encryption.',
                color: 'text-blue-400',
                bg: 'bg-blue-500/10 border border-blue-500/20',
              },
              {
                icon: Zap,
                title: 'Zero Knowledge',
                desc: "We can't read your messages, listen to calls, or access files.",
                color: 'text-amber-400',
                bg: 'bg-amber-500/10 border border-amber-500/20',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-card/50 backdrop-blur-md border border-border/60 rounded-2xl p-5 text-left hover:border-primary/40 transition-all duration-300 hover:-translate-y-0.5"
              >
                <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <h3 className="font-bold text-foreground mb-1.5 text-sm">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Additional Features Row */}
          <div className="grid sm:grid-cols-4 gap-3 mt-6 animate-appear">
            {[
              { icon: Users, label: 'Group Chats' },
              { icon: Fingerprint, label: 'Biometric Auth' },
              { icon: Sparkles, label: 'Rich Media' },
              { icon: Wifi, label: 'Offline Support' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2.5 p-3 bg-card/30 border border-border/50 rounded-xl hover:border-primary/20 transition-colors"
              >
                <item.icon className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-semibold text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Trust Badges */}
          <div className="mt-20 mb-6 animate-appear">
            <div className="flex items-center justify-center gap-6 text-muted-foreground">
              {[
                { icon: Shield, label: 'SOC 2' },
                { icon: Lock, label: 'GDPR' },
                { icon: Globe, label: 'Open Source' },
              ].map((item, i) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  {i > 0 && <div className="w-px h-3.5 bg-border mx-2" />}
                  <item.icon className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-5 text-center text-xs text-muted-foreground relative z-10">
        &copy; {new Date().getFullYear()} Zynk &middot; Privacy-first communication
      </footer>
    </div>
  );
}
