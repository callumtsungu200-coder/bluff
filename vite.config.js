import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths, so the same build works at a domain root (Netlify) and under /bluff/ (GitHub Pages).
  base: './',
  plugins: [react()],
});
