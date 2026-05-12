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
        primary:   '#1A5F7A',
        secondary: '#57C5B6',
        accent:    '#FF6B6B',
        dark:      '#2C3E50',
        light:     '#F8F9FA',
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
