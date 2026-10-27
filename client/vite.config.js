import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// jsPDF's optional add-ons (HTML/SVG rendering) are never used: the certificates only draw text and shapes.
// Pointing them at an empty module keeps them (and DOMPurify) out of the bundle.
const empty = fileURLToPath(new URL('./src/empty-module.js', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { html2canvas: empty, dompurify: empty, canvg: empty },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5000' },
  },
});
