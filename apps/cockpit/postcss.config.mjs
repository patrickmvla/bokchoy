// Tailwind v4 PostCSS config per [[frontend-stack]].
// Tailwind v4 ships its own PostCSS plugin; no separate tailwindcss + autoprefixer
// entries needed (v3 pattern). Tailwind v4 also supports JIT + arbitrary-value
// generation natively; tailwind.config.ts is OPTIONAL (config via @theme in CSS).

export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
