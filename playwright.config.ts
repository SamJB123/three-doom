import { defineConfig } from '@playwright/test';
const browserName=process.env.PLAYWRIGHT_BROWSER??'chromium';
if(browserName!=='chromium'&&browserName!=='webkit')throw Error('PLAYWRIGHT_BROWSER must be chromium or webkit');
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  workers: 1,
  outputDir: browserName==='webkit'?'artifacts/browser-webkit':'test-results',
  use: {
    baseURL: 'http://127.0.0.1:3010',
    browserName,
    channel: browserName==='chromium'?process.env.PLAYWRIGHT_CHANNEL:undefined,
    viewport: { width: 960, height: 720 },
    launchOptions: browserName==='chromium'?{ args: ['--enable-unsafe-webgpu'] }:{},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3010 --strictPort',
    url: 'http://127.0.0.1:3010',
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER==='1',
    timeout: 30_000
  }
});
