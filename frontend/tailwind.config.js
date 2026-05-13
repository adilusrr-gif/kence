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
        primary:   '#1E3A6E',
        secondary: '#C49B3C',
        accent:    '#2952A3',
        dark:      '#0B1A2E',
        light:     '#EEF1F8',
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
