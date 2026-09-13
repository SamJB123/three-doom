import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3010',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    viewport: { width: 960, height: 720 },
    launchOptions: { args: ['--enable-unsafe-webgpu'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3010 --strictPort',
    url: 'http://127.0.0.1:3010',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
