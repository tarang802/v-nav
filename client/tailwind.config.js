/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#e0e9ff',
          200: '#c2d3fe',
          300: '#9ab4fd',
          400: '#6b8dfb',
          500: '#4361f8',
          600: '#2b42ed',
          700: '#2130d9',
          800: '#2129b0',
          900: '#21278b',
          950: '#161854',
        },
        accent: {
          green:  '#22d3a1',
          orange: '#f97316',
          red:    '#ef4444',
          purple: '#a855f7',
        },
        glass: {
          DEFAULT: 'rgba(255,255,255,0.05)',
          hover:   'rgba(255,255,255,0.09)',
          border:  'rgba(255,255,255,0.10)',
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #4361f8 0%, #a855f7 100%)',
        'gradient-dark':  'linear-gradient(160deg, #0d0d14 0%, #0a0a0a 100%)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'ping-slow': 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':       { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
}
