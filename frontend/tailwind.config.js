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
        risk: {
          1: '#10b981', // Situación 1: Optimal
          2: '#f59e0b', // Situación 2: Watch
          3: '#f97316', // Situación 3: Warning
          4: '#f43f5e', // Situación 4: High Alert
          5: '#ef4444', // Situación 5: Default/Critical
          6: '#a855f7', // Situación 6: Technical Loss
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
