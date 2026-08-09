// Tailwind v4 ships its own PostCSS plugin and handles vendor prefixing
// internally, so the v2-era `tailwindcss` + `autoprefixer` pair is gone.
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
