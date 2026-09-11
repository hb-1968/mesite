import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// local-first config -- defaults to '/' so the node-launched dev
// server serves cleanly at http://localhost:5173/. set VITE_BASE
// at build time if you ever publish under a subpath
const BASE = process.env.VITE_BASE ?? '/';

export default defineConfig({
  plugins: [react()],
  base: BASE,
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 2048
  }
});
