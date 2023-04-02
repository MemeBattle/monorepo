/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        memebattleYellow: '#fce26b',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
