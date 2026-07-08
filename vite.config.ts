import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  base: process.env.NODE_ENV === 'production' ? '/the-old-kings-crown/' : '/',
  build: { outDir: 'dist' }
});
