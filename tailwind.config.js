/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand palette is the actual design blue. Earlier the palette here
        // was a green scale, the app rendered blue elsewhere, and a 40-line
        // !important block in globals.css forcibly overrode every utility
        // class. That's now collapsed into a single source of truth — same
        // values the inline <style> in app/layout.tsx already exposes as
        // CSS variables.
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e3a5f',
          900: '#0f1e38',
          950: '#060e1f',
          DEFAULT: '#2563eb',
        },
        accent: {
          DEFAULT: '#F5A623',
          light:   '#fbbf46',
          dark:    '#d48a0a',
        },
      },
      fontFamily: {
        display: ['var(--font-sora)',    'system-ui', 'sans-serif'],
        body:    ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4' }],
        xs:    ['11px', { lineHeight: '1.5' }],
        sm:    ['13px', { lineHeight: '1.55' }],
        base:  ['15px', { lineHeight: '1.6' }],
        md:    ['17px', { lineHeight: '1.6' }],
        lg:    ['20px', { lineHeight: '1.5' }],
        xl:    ['24px', { lineHeight: '1.4' }],
        '2xl': ['30px', { lineHeight: '1.25' }],
        '3xl': ['38px', { lineHeight: '1.15' }],
        '4xl': ['50px', { lineHeight: '1.08' }],
        '5xl': ['64px', { lineHeight: '1.05' }],
      },
      borderRadius: {
        sm:    '6px',
        md:    '10px',
        lg:    '16px',
        xl:    '24px',
        '2xl': '32px',
      },
      boxShadow: {
        // rgba(37,99,235) = brand-600 (#2563eb). The previous values used
        // the old green palette and silently mismatched every blue surface.
        'sm-brand': '0 1px 4px rgba(37,99,235,0.06)',
        'md-brand': '0 4px 16px rgba(37,99,235,0.10)',
        'lg-brand': '0 8px 32px rgba(37,99,235,0.14)',
        'xl-brand': '0 16px 56px rgba(37,99,235,0.18)',
      },
      animation: {
        'fade-in':  'fadeIn 0.24s ease both',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        'modal-in': 'modalIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        'toast-in': 'toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        'shimmer':  'shimmer 1.5s ease infinite',
        'spin-slow':'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        modalIn: { from: { transform: 'scale(0.94) translateY(12px)', opacity: '0' }, to: { transform: 'scale(1) translateY(0)', opacity: '1' } },
        toastIn: { from: { transform: 'translateY(20px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
      },
      screens: { xs: '480px' },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
  ],
};
