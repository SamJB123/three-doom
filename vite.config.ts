import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 3000
  },
  plugins: [cloudflare()],
});
