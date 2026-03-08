import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'path';

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 3000
  },
  resolve: {
    alias: {
      util: path.resolve( __dirname, 'src/util-shim.ts' )
    }
  },
  plugins: [cloudflare()],
});
