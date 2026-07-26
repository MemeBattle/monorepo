module.exports = {
  plugins: {
    // Tailwind v4 ships its own PostCSS plugin and handles vendor prefixing itself,
    // so autoprefixer is no longer needed here.
    '@tailwindcss/postcss': {},
  },
}
