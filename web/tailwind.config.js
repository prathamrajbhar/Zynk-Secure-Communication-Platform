/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        zynk: {
          50:  '#f0f0ff',
          100: '#e4e3ff',
          200: '#cdccfe',
          300: '#aeaafc',
          400: '#9285f8',
          500: '#7c5cf2',
          600: '#6e3de8',
          700: '#5f2fd4',
          800: '#4f28b2',
          900: '#422591',
          950: '#271563',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '100': '25rem',
        '108': '27rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glow': '0 0 0 3px var(--accent-ring)',
        'soft': '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'lifted': '0 4px 24px -4px rgb(0 0 0 / 0.08)',
        'float': '0 8px 32px -8px rgb(0 0 0 / 0.12)',
        'overlay': '0 16px 48px -12px rgb(0 0 0 / 0.18)',
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out forwards',
        'slide-up': 'slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slide-down 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-right': 'slide-in-right 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-left': 'slide-in-left 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'float': 'float 4s ease-in-out infinite',
        'msg-in-right': 'msg-in-right 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'msg-in-left': 'msg-in-left 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'modal': 'modal-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'backdrop': 'backdrop-enter 0.2s ease-out forwards',
        'shimmer': 'shimmer 2s infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'fab': 'fab-enter 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'appear': 'appear 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'gradient-flow': 'gradient-flow 6s ease infinite',
        'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
        'bounce-in': 'bounce-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'msg-in-right': {
          from: { opacity: '0', transform: 'translateX(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'msg-in-left': {
          from: { opacity: '0', transform: 'translateX(-8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'modal-enter': {
          from: { opacity: '0', transform: 'scale(0.97) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'backdrop-enter': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'fab-enter': {
          from: { opacity: '0', transform: 'scale(0) rotate(-15deg)' },
          to: { opacity: '1', transform: 'scale(1) rotate(0)' },
        },
        'appear': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'gradient-flow': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 4px var(--accent-ring)' },
          '50%': { boxShadow: '0 0 20px var(--accent-ring)' },
        },
        'bounce-in': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '60%': { transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'typing-bounce': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-5px)', opacity: '1' },
        },
        'status-pulse': {
          '0%': { boxShadow: '0 0 0 0 var(--success)' },
          '70%': { boxShadow: '0 0 0 6px transparent' },
          '100%': { boxShadow: '0 0 0 0 transparent' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
