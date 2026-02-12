'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import {
  Button, Card, CardBody, Chip, Navbar, NavbarBrand, NavbarContent, NavbarItem,
  Divider,
} from '@heroui/react';
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
      {/* Animated Background Orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Skip to content */}
      <a href="#hero" className="sr-only-focusable fixed top-2 left-2 z-[100]">Skip to content</a>

      {/* Navbar */}
      <Navbar
        maxWidth="xl"
        isBlurred
        isBordered={false}
        classNames={{
          base: 'bg-background/60 backdrop-blur-xl backdrop-saturate-150',
          wrapper: 'px-6 lg:px-10',
        }}
      >
        <NavbarBrand>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-primary-foreground text-sm font-black">Z</span>
            </div>
            <span className="text-lg font-black text-foreground tracking-tight">Zynk</span>
          </div>
        </NavbarBrand>
        <NavbarContent justify="end">
          <NavbarItem>
            <Button
              as={Link}
              href="/login"
              variant="light"
              size="sm"
              className="font-semibold text-default-500"
            >
              Sign In
            </Button>
          </NavbarItem>
          <NavbarItem>
            <Button
              as={Link}
              href="/register"
              color="primary"
              size="sm"
              radius="lg"
              className="font-semibold shadow-lg shadow-primary/25 btn-shimmer"
              endContent={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Get Started
            </Button>
          </NavbarItem>
        </NavbarContent>
      </Navbar>

      {/* Hero Section */}
      <main id="hero" className="flex-1 flex items-center justify-center px-6 relative z-10">
        <div className="max-w-2xl text-center py-16">
          {/* Badge */}
          <div className="animate-appear stagger-1">
            <Chip
              variant="flat"
              color="primary"
              size="sm"
              startContent={<Lock className="w-3 h-3" />}
              endContent={<ChevronRight className="w-3 h-3 opacity-50" />}
              classNames={{ base: 'mb-8 px-3 py-4', content: 'font-semibold text-xs' }}
            >
              End-to-end encrypted
            </Chip>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-foreground mb-5 leading-[1.08] tracking-tight animate-appear stagger-2">
            The future of<br />
            <span className="gradient-text-animated">private messaging</span>
          </h1>

          <p className="text-base sm:text-lg text-default-500 mb-10 max-w-md mx-auto leading-relaxed animate-appear stagger-3">
            Messaging, voice &amp; video calls, and file sharing — all encrypted by default. No compromises.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-appear stagger-4">
            <Button
              as={Link}
              href="/register"
              color="primary"
              size="lg"
              radius="lg"
              className="font-bold shadow-lg shadow-primary/30 hover-lift btn-shimmer px-8"
              endContent={<ArrowRight className="w-4 h-4" />}
            >
              Start Messaging
            </Button>
            <Button
              as={Link}
              href="/login"
              variant="bordered"
              size="lg"
              radius="lg"
              className="font-semibold border-default-200 px-8"
            >
              Learn More
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 sm:gap-14 mt-14 animate-appear stagger-5">
            {[
              { num: '256-bit', label: 'AES Encryption' },
              { num: 'Zero', label: 'Knowledge Arch.' },
              { num: '100%', label: 'Open Protocol' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-xl sm:text-2xl font-black text-foreground">{stat.num}</div>
                <div className="text-2xs sm:text-xs text-default-400 font-medium mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Feature Cards */}
          <div className="grid sm:grid-cols-3 gap-4 mt-16 animate-appear stagger-6">
            {[
              {
                icon: MessageCircle,
                title: 'Encrypted Chat',
                desc: 'Every message end-to-end encrypted with X25519 + AES-256-GCM.',
                color: 'text-violet-400',
                bg: 'bg-violet-500/10',
              },
              {
                icon: Video,
                title: 'Secure Calls',
                desc: 'Crystal-clear voice & video calls with SRTP encryption.',
                color: 'text-blue-400',
                bg: 'bg-blue-500/10',
              },
              {
                icon: Zap,
                title: 'Zero Knowledge',
                desc: "We can't read your messages, listen to calls, or access files.",
                color: 'text-amber-400',
                bg: 'bg-amber-500/10',
              },
            ].map((item) => (
              <Card
                key={item.title}
                isHoverable
                isPressable
                shadow="sm"
                classNames={{
                  base: 'bg-content1/60 backdrop-blur-md border border-divider hover:border-primary/30 transition-all duration-300',
                  body: 'p-5 text-left',
                }}
              >
                <CardBody>
                  <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <h3 className="font-bold text-foreground mb-1.5 text-sm">{item.title}</h3>
                  <p className="text-xs text-default-400 leading-relaxed">{item.desc}</p>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Additional Features Row */}
          <div className="grid sm:grid-cols-4 gap-3 mt-6 animate-appear stagger-7">
            {[
              { icon: Users, label: 'Group Chats' },
              { icon: Fingerprint, label: 'Biometric Auth' },
              { icon: Sparkles, label: 'Rich Media' },
              { icon: Wifi, label: 'Offline Support' },
            ].map((item) => (
              <Card
                key={item.label}
                shadow="none"
                classNames={{
                  base: 'bg-content1/40 border border-divider hover:border-primary/20 transition-colors',
                  body: 'p-3 flex-row items-center gap-2.5',
                }}
              >
                <CardBody>
                  <item.icon className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-default-500">{item.label}</span>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Trust Badges */}
          <div className="mt-20 mb-6 animate-appear stagger-8">
            <div className="flex items-center justify-center gap-6 text-default-400">
              {[
                { icon: Shield, label: 'SOC 2' },
                { icon: Lock, label: 'GDPR' },
                { icon: Globe, label: 'Open Source' },
              ].map((item, i) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  {i > 0 && <Divider orientation="vertical" className="h-3.5 mx-2" />}
                  <item.icon className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-5 text-center text-xs text-default-400 relative z-10">
        &copy; {new Date().getFullYear()} Zynk &middot; Privacy-first communication
      </footer>
    </div>
  );
}
