// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages: https://rodrodr.github.io/mis/ (repository rodrodr/mis).
export default defineConfig({
  site: 'https://rodrodr.github.io',
  base: '/mis',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  compressHTML: true,
  vite: {
    server: { fs: { allow: ['..'] } },
  },
});
