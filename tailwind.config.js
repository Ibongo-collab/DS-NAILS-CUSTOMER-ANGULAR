/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ts,scss}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Raleway', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        raleway: ['Raleway', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

