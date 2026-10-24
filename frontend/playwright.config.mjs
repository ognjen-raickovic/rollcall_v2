import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    timezoneId: 'Europe/Budapest',
    trace: 'retain-on-failure',
    actionTimeout: 15000,
    screenshot: 'only-on-failure',
  },
  projects: [375, 1440].flatMap((width) =>
    ['dark', 'light'].map((theme) => ({
      name: `${width}-${theme}`,
      use: { viewport: { width, height: 1000 }, colorScheme: theme },
      metadata: { theme },
    })),
  ),
})
