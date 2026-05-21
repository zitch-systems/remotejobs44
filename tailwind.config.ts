/** @type {import('tailwindcss').Config} */
function safeRequire(pkg: string) {
  try { return require(pkg); } catch { return null; }
}

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Emerald Pro — richer, more saturated than before
        brand: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#0d7a5f',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
          DEFAULT: '#0d7a5f',
        },
        accent: {
          DEFAULT: '#f59e0b',
          light:   '#fbbf24',
          dark:    '#d97706',
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
      borderRadius: { sm:'6px', md:'10px', lg:'16px', xl:'24px', '2xl':'32px' },
      boxShadow: {
        'sm-brand': '0 1px 4px rgba(13,122,95,0.08)',
        'md-brand': '0 4px 20px rgba(13,122,95,0.12)',
        'lg-brand': '0 8px 40px rgba(13,122,95,0.16)',
        'xl-brand': '0 16px 60px rgba(13,122,95,0.20)',
        'glow':     '0 0 0 3px rgba(16,185,129,0.25)',
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease both',
        'slide-up':  'slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
        'modal-in':  'modalIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
        'toast-in':  'toastIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
        'shimmer':   'shimmer 1.6s ease infinite',
        'bounce-in': 'bounceIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        'spin-slow': 'spin 2s linear infinite',
        'pulse-brand':'pulseBrand 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:     { from:{opacity:'0'},                               to:{opacity:'1'} },
        slideUp:    { from:{transform:'translateY(14px)',opacity:'0'},   to:{transform:'translateY(0)',opacity:'1'} },
        modalIn:    { from:{transform:'scale(0.95) translateY(10px)',opacity:'0'}, to:{transform:'scale(1) translateY(0)',opacity:'1'} },
        toastIn:    { from:{transform:'translateY(16px)',opacity:'0'},   to:{transform:'translateY(0)',opacity:'1'} },
        bounceIn:   { from:{transform:'scale(0.8)',opacity:'0'},         to:{transform:'scale(1)',opacity:'1'} },
        shimmer:    { '0%':{backgroundPosition:'200% 0'},'100%':{backgroundPosition:'-200% 0'} },
        pulseBrand: { '0%,100%':{opacity:'1'},'50%':{opacity:'0.6'} },
      },
      screens: { xs:'480px' },
    },
  },
  plugins: [
    safeRequire('@tailwindcss/typography'),
    safeRequire('@tailwindcss/forms'),
  ].filter(Boolean),
};
