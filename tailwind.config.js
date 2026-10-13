/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: '#22d3ee',
          foreground: '#04070c'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        border: 'hsl(var(--border))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        fx: {
          bg: 'var(--fx-bg)',
          elevated: 'var(--fx-bg-elevated)',
          surface: 'var(--fx-surface)',
          'surface-hover': 'var(--fx-surface-hover)',
          glass: 'var(--fx-glass)',
          border: 'var(--fx-border)',
          'border-strong': 'var(--fx-border-strong)',
          accent: 'var(--fx-accent)',
          'accent-dim': 'var(--fx-accent-dim)',
          text: 'var(--fx-text)',
          muted: 'var(--fx-muted)',
          danger: 'var(--fx-danger)',
          ok: 'var(--fx-ok)'
        }
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        frost: '0 12px 40px rgba(0, 0, 0, 0.5)',
        soft: '0 16px 48px rgba(0, 0, 0, 0.55)'
      },
      transitionDuration: {
        fx: '180ms'
      }
    }
  },
  plugins: []
}
