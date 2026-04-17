import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Fluent 2 palette — tuned, not verbatim Microsoft
        fluent: {
          blue: {
            50: '#EFF6FC',
            100: '#DEECF9',
            200: '#C7E0F4',
            300: '#A3CEEE',
            400: '#71AFE5',
            500: '#0078D4',  // primary
            600: '#106EBE',
            700: '#005A9E',
            800: '#004578',
            900: '#002050',
          },
          neutral: {
            0: '#FFFFFF',
            4: '#FAFAFA',
            6: '#F5F5F5',
            8: '#F0F0F0',
            10: '#E5E5E5',
            20: '#D1D1D1',
            30: '#B3B3B3',
            40: '#8A8A8A',
            50: '#707070',
            60: '#5C5C5C',
            70: '#424242',
            80: '#292929',
            90: '#1F1F1F',
            95: '#141414',
          },
          accent: {
            purple: '#8764B8',
            green: '#107C10',
            orange: '#D83B01',
            red: '#C50F1F',
            yellow: '#FFB900',
            teal: '#00B7C3',
            pink: '#C239B3',
          },
        },
      },
      fontFamily: {
        sans: ['var(--font-segoe)', 'Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Segoe UI Variable Display', 'Segoe UI', 'system-ui'],
      },
      boxShadow: {
        // Fluent elevation levels
        'fluent-2':  '0 1px 2px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.06)',
        'fluent-4':  '0 2px 4px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.08)',
        'fluent-8':  '0 4px 8px rgba(0,0,0,0.08), 0 8px 16px rgba(0,0,0,0.10)',
        'fluent-16': '0 8px 16px rgba(0,0,0,0.10), 0 16px 32px rgba(0,0,0,0.12)',
        'fluent-28': '0 14px 28px rgba(0,0,0,0.12), 0 28px 48px rgba(0,0,0,0.14)',
        'fluent-64': '0 32px 64px rgba(0,0,0,0.14)',
        'fluent-inset': 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      backgroundImage: {
        'acrylic': 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.55) 100%)',
        'mesh': 'radial-gradient(at 20% 10%, rgba(0,120,212,0.08) 0%, transparent 50%), radial-gradient(at 80% 20%, rgba(135,100,184,0.08) 0%, transparent 50%), radial-gradient(at 50% 80%, rgba(0,183,195,0.06) 0%, transparent 50%)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'slide-in': { '0%': { opacity: '0', transform: 'translateX(-8px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'shimmer': { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        'fade-in': 'fade-in 0.3s cubic-bezier(0.33, 0, 0.67, 1)',
        'slide-in': 'slide-in 0.3s cubic-bezier(0.33, 0, 0.67, 1)',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.33, 0, 0.67, 1)',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};
export default config;
