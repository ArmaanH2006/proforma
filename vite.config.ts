import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vitest/config';

// `npm run build` produces a normal static site in dist/ (GitHub Pages, Vercel, Netlify).
// `npm run build:embed` inlines everything into one HTML file for sandboxed hosts.
export default defineConfig(({ mode }) => {
  const embed = mode === 'embed';
  return {
    base: './',
    plugins: [react(), ...(embed ? [viteSingleFile()] : [])],
    build: {
      outDir: embed ? 'dist-embed' : 'dist',
      target: 'es2022',
      sourcemap: !embed,
    },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
      coverage: {
        include: ['src/engine/**/*.ts'],
        exclude: ['src/**/*.test.ts', 'src/engine/index.ts'],
      },
    },
  };
});
