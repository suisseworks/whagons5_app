import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.EXPO_WEB_PORT || 19006);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `EXPO_NO_TELEMETRY=1 BROWSER=none npx expo start --web --port ${port} --clear`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile-web-chromium',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
});
