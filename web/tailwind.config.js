/** @type {import('tailwindcss').Config} */
const { heroui } = require('@heroui/react');

module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: { '2xs': ['0.625rem', { lineHeight: '0.875rem' }] },
      spacing: {
        '4.5': '1.125rem', '13': '3.25rem', '15': '3.75rem', '18': '4.5rem',
        '22': '5.5rem', '76': '19rem', '84': '21rem', '88': '22rem',
        '100': '25rem', '108': '27rem', '120': '30rem',
      },
      maxWidth: { chat: '52rem' },
      animation: {
        'msg-in-right': 'msg-in-right 0.25s cubic-bezier(0.16,1,0.3,1) forwards',
        'msg-in-left': 'msg-in-left 0.25s cubic-bezier(0.16,1,0.3,1) forwards',
        'msg-send': 'msg-send 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards',
        shimmer: 'shimmer 2s infinite linear',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        float: 'float 4s ease-in-out infinite',
        'typing-bounce': 'typing-bounce 1.4s ease-in-out infinite',
        'status-pulse': 'status-pulse 2s ease-out infinite',
        'gradient-flow': 'gradient-flow 6s ease infinite',
        appear: 'appear 0.5s cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        'msg-in-right': {
          from: { opacity: '0', transform: 'translateX(10px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'msg-in-left': {
          from: { opacity: '0', transform: 'translateX(-10px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'msg-send': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.93)' },
          '60%': { transform: 'translateY(-2px) scale(1.01)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'pulse-soft': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        'typing-bounce': {
          '0%,80%,100%': { transform: 'translateY(0) scale(0.7)', opacity: '0.4' },
          '40%': { transform: 'translateY(-6px) scale(1)', opacity: '1' },
        },
        'status-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(23,201,100,0.45)' },
          '70%': { boxShadow: '0 0 0 6px rgba(23,201,100,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(23,201,100,0)' },
        },
        'gradient-flow': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        appear: {
          from: { opacity: '0', transform: 'translateY(14px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
    },
  },
  plugins: [
    heroui({
      addCommonColors: true,
      defaultTheme: 'dark',
      defaultExtendTheme: 'dark',
      themes: {
        dark: {
          colors: {
            background: '#09090b',
            foreground: '#ecedee',
            primary: { 50: '#ede9fe', 100: '#ddd6fe', 200: '#c4b5fd', 300: '#a78bfa', 400: '#8b5cf6', 500: '#7c3aed', 600: '#6d28d9', 700: '#5b21b6', 800: '#4c1d95', 900: '#2e1065', DEFAULT: '#7c3aed', foreground: '#fff' },
            secondary: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#94a3b8', 400: '#64748b', 500: '#475569', 600: '#334155', 700: '#1e293b', 800: '#0f172a', 900: '#020617', DEFAULT: '#1e293b', foreground: '#e2e8f0' },
            success: { DEFAULT: '#17c964', foreground: '#000' },
            warning: { DEFAULT: '#f5a524', foreground: '#000' },
            danger: { DEFAULT: '#f31260', foreground: '#fff' },
            content1: '#111113',
            content2: '#18181b',
            content3: '#1f1f23',
            content4: '#27272a',
            focus: '#7c3aed',
            divider: 'rgba(255,255,255,0.06)',
            overlay: 'rgba(0,0,0,0.65)',
          },
          layout: {
            radius: { small: '8px', medium: '12px', large: '16px' },
            borderWidth: { small: '1px', medium: '1px', large: '2px' },
          },
        },
        light: {
          colors: {
            background: '#fafafa',
            foreground: '#11181C',
            primary: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', DEFAULT: '#7c3aed', foreground: '#fff' },
            secondary: { DEFAULT: '#f1f5f9', foreground: '#334155' },
            success: { DEFAULT: '#17c964', foreground: '#fff' },
            warning: { DEFAULT: '#f5a524', foreground: '#000' },
            danger: { DEFAULT: '#f31260', foreground: '#fff' },
            content1: '#ffffff',
            content2: '#f4f4f5',
            content3: '#e4e4e7',
            content4: '#d4d4d8',
            focus: '#7c3aed',
            divider: 'rgba(0,0,0,0.06)',
            overlay: 'rgba(0,0,0,0.4)',
          },
        },
      },
    }),
  ],
};
