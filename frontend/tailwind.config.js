/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary:   '#3B82F6',
        secondary: '#64748B',
        accent:    '#2563EB',
        dark:      '#111827',
        light:     '#F9FAFB',
        card:           'hsl(var(--card))',
        'card-foreground':    'hsl(var(--card-foreground))',
        'muted-foreground':   'hsl(var(--muted-foreground))',
      },
      animation: {
        spotlight: 'spotlight 2s ease 0.75s 1 forwards',
      },
      keyframes: {
        spotlight: {
          '0%':   { opacity: 0, transform: 'translate(-72%, -62%) scale(0.5)' },
          '100%': { opacity: 1, transform: 'translate(-50%, -40%) scale(1)'   },
        },
      },
    },
  },
  plugins: [],
}
