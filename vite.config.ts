import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// If you publish to https://hb-1968.github.io/<repo-name>/, set BASE to '/<repo-name>/'.
// For a user/organization site (hb-1968.github.io repo) leave it as '/'.
// Override at build time:  VITE_BASE=/my-repo/ npm run build
const BASE = process.env.VITE_BASE ?? '/portfolio/';

export default defineConfig({
  plugins: [react()],
  base: BASE,
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 2048
  }
});
