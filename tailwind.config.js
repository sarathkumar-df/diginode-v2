/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // DigoNode brand colors
        brand: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d5fd',
          300: '#a5b8fb',
          400: '#8093f7',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // Node colors
        node: {
          coral: '#FF6B6B',
          orange: '#FF9F43',
          yellow: '#FECA57',
          green: '#48DBFB',
          teal: '#1DD1A1',
          blue: '#54A0FF',
          purple: '#5F27CD',
          pink: '#FF9FF3',
        },
        // Canvas colors
        canvas: {
          light: '#FEFCF3',
          dark: '#1A1B2E',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'thinking': 'thinking 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideRight: { from: { opacity: '0', transform: 'translateX(-8px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        thinking: { '0%, 80%, 100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } },
      },
      boxShadow: {
        'node': '0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)',
        'node-selected': '0 0 0 3px rgba(99, 102, 241, 0.5), 0 4px 20px rgba(0, 0, 0, 0.12)',
        'panel': '0 8px 32px rgba(0, 0, 0, 0.12)',
        'toolbar': '0 2px 12px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
}
