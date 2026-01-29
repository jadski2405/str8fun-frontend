/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0b0e14',
          border: '#2a303c',
          button: '#1c2128',
        }
      }
    },
  },
  plugins: [],
}
