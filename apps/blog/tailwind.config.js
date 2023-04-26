// eslint-disable-next-line @typescript-eslint/no-var-requires
const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        memebattleYellow: '#fce26b',
      },
      fontFamily: {
        sans: ['var(--font-gravity)', ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        sm: ['0px 2px 5px 0px rgba(103, 110, 118, 0.08)', '0px 1px 1px 0px rgba(0, 0, 0, 0.12)'],
        DEFAULT: ['0px 1px 1px 0px rgba(0, 0, 0, 0.12)', '0px 0px 0px 1px rgba(103, 110, 118, 0.16)', '0px 2px 5px 0px rgba(103, 110, 118, 0.08)'],
        lg: ['0px 15px 35px 0px rgba(103, 110, 118, 0.08)', '0px 5px 15px 0px rgba(0, 0, 0, 0.12)'],
      },
      height: {
        18: '4.5rem',
      },
      keyframes: {
        slideDown: {
          from: {
            opacity: 0,
            transform: 'translateY(-10px)',
          },
          to: {
            opacity: 1,
            transform: 'translateY(0)',
          },
        },
      },
      animation: {
        slideDown: 'slideDown 0.3s ease-in-out',
      },
    },
  },

  plugins: [require('@tailwindcss/typography')],
}
