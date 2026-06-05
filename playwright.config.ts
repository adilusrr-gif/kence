import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
          headless: true,
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    cwd: './frontend',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
