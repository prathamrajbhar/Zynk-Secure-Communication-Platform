import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Zynk - Secure Communication',
  description: 'Privacy-first encrypted messaging, calls, and file sharing',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Zynk',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#5b5fc7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('zynk-theme')||'dark';var s=localStorage.getItem('zynk-color-scheme')||'violet';var d=document.documentElement;if(t==='dark')d.classList.add('dark');else d.classList.remove('dark');d.setAttribute('data-theme',s)}catch(e){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','violet')}})()`,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] shadow-lifted !rounded-xl',
            duration: 3000,
          }}
        />
      </body>
    </html>
  );
}
