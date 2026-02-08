'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { Shield, MessageCircle, Video, Lock } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { isAuthenticated, hydrate } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/chat');
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Shield className="w-8 h-8 text-zynk-500" />
          <span className="text-xl font-bold text-[var(--text-primary)]">Zynk</span>
        </div>
        <div className="flex gap-3">
          <Link href="/login" className="btn-secondary text-sm">Sign In</Link>
          <Link href="/register" className="btn-primary text-sm">Get Started</Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-4xl text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-[var(--text-primary)] mb-6">
            Communicate <span className="text-zynk-500">Freely</span>,<br />
            Communicate <span className="text-zynk-500">Securely</span>
          </h1>
          <p className="text-xl text-[var(--text-secondary)] mb-10 max-w-2xl mx-auto">
            End-to-end encrypted messaging, voice & video calls, and file sharing.
            Your privacy is not optional — it&apos;s the default.
          </p>

          <div className="flex justify-center gap-4 mb-16">
            <Link href="/register" className="btn-primary text-lg px-8 py-3">
              Start Messaging
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="card text-center">
              <MessageCircle className="w-10 h-10 text-zynk-500 mx-auto mb-3" />
              <h3 className="font-semibold text-[var(--text-primary)] mb-2">Encrypted Messaging</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Every message is end-to-end encrypted. Only you and the recipient can read them.
              </p>
            </div>
            <div className="card text-center">
              <Video className="w-10 h-10 text-zynk-500 mx-auto mb-3" />
              <h3 className="font-semibold text-[var(--text-primary)] mb-2">Secure Calls</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Crystal-clear voice & video calls with E2E encryption. No eavesdropping.
              </p>
            </div>
            <div className="card text-center">
              <Lock className="w-10 h-10 text-zynk-500 mx-auto mb-3" />
              <h3 className="font-semibold text-[var(--text-primary)] mb-2">Zero Knowledge</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                We can&apos;t read your messages, listen to your calls, or access your files. Ever.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[var(--border)] px-6 py-4 text-center text-sm text-[var(--text-muted)]">
        &copy; {new Date().getFullYear()} Zynk. Privacy by default.
      </footer>
    </div>
  );
}
