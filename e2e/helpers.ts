import { Page } from '@playwright/test'

export const BASE_URL = 'http://localhost:5173'
export const API_URL  = 'http://localhost:8000'

/** Log in via the UI and return the JWT token. */
export async function login(page: Page, username = 'admin', password = 'kence2026!') {
  await page.goto('/login')
  // Use name/type selectors — more reliable than placeholder text
  const usernameInput = page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').first()
  const passwordInput = page.locator('input[type="password"]').first()
  await usernameInput.fill(username)
  await passwordInput.fill(password)
  await page.getByRole('button', { name: /войти|login|вход/i }).click()
  await page.waitForURL(/^\/((?!login).)*$/, { timeout: 15_000 })
}

/** Upload a file using the UI upload page. Returns the session_id cookie/storage value if available. */
export async function uploadFile(page: Page, filePath: string) {
  await page.goto('/upload')
  const input = page.locator('input[type="file"]')
  await input.setInputFiles(filePath)
  await page.getByRole('button', { name: /загрузить|upload/i }).click()
  await page.waitForSelector('[data-testid="upload-success"], text=/обработан|processed/i', {
    timeout: 120_000,
  })
}
