/** @type {import('tailwindcss').Config} */
const tone = (name) => `rgb(var(${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          950: tone('--forest-950'),
          900: tone('--forest-900'),
          800: tone('--forest-800'),
          700: tone('--forest-700'),
          600: tone('--forest-600'),
          500: tone('--forest-500'),
          400: tone('--forest-400'),
          300: tone('--forest-300'),
          200: tone('--forest-200'),
          100: tone('--forest-100'),
        },
        amber: {
          950: tone('--amber-950'),
          900: tone('--amber-900'),
          800: tone('--amber-800'),
          700: tone('--amber-700'),
          600: tone('--amber-600'),
          500: tone('--amber-500'),
          400: tone('--amber-400'),
          300: tone('--amber-300'),
          200: tone('--amber-200'),
          100: tone('--amber-100'),
        },
        slate: {
          950: tone('--slate-950'),
          900: tone('--slate-900'),
          800: tone('--slate-800'),
          700: tone('--slate-700'),
          600: tone('--slate-600'),
          500: tone('--slate-500'),
          400: tone('--slate-400'),
          300: tone('--slate-300'),
          200: tone('--slate-200'),
          100: tone('--slate-100'),
        },
      },
      fontFamily: {
        display: ['"Fraunces"', '"Playfair Display"', 'Georgia', 'serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        body:    ['"Plus Jakarta Sans"', '"DM Sans"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow':    'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'float':         'float 6s ease-in-out infinite',
        'ripple':        'ripple 1.5s ease-out',
        'slide-up':      'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
        'fade-in':       'fadeIn 0.3s ease-out',
        'wave':          'wave 2s ease-in-out infinite',
      },
      keyframes: {
        float:   { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-8px)' } },
        ripple:  { '0%': { transform: 'scale(0)', opacity: '1' }, '100%': { transform: 'scale(4)', opacity: '0' } },
        slideUp: { '0%': { transform: 'translateY(12px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        wave:    { '0%,100%': { transform: 'scaleY(0.4)' }, '50%': { transform: 'scaleY(1)' } },
      },
      backgroundImage: {
        'mesh-green': 'radial-gradient(at 27% 37%, #0f5c42 0px, transparent 50%), radial-gradient(at 97% 21%, #041a10 0px, transparent 50%), radial-gradient(at 52% 99%, #0a3d2e 0px, transparent 50%)',
        'mesh-dark':  'radial-gradient(at 0% 0%, #0a3d2e33 0px, transparent 60%), radial-gradient(at 100% 100%, #167a5733 0px, transparent 60%)',
      },
    },
  },
  plugins: [],
}
