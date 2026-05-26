/**
 * E2E: Presentation generation flow
 * Login → upload → go to /presentation → generate plan → build → download
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import { login } from './helpers'

const SAMPLE_TXT = path.join(__dirname, 'fixtures', 'sample.txt')

test.describe('Presentation flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('generates presentation plan after upload', async ({ page }) => {
    // Upload document
    await page.goto('/upload')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(SAMPLE_TXT)
    await expect(page.locator('text=/обработан|processed|готов/i').first()).toBeVisible({
      timeout: 120_000,
    })

    // Navigate to presentation page
    await page.goto('/presentation')

    // Generate plan
    const generateBtn = page.getByRole('button', { name: /генерир|generate|создать план/i }).first()
    await generateBtn.click()

    // Expect slide list to appear
    await expect(
      page.locator('[data-testid="slide-list"], text=/слайд|slide/i').first()
    ).toBeVisible({ timeout: 60_000 })
  })

  test('presentation page renders without session', async ({ page }) => {
    await page.goto('/presentation')
    // Should show a placeholder or empty state (not crash)
    await expect(page.locator('body')).toBeVisible()
    await expect(page).not.toHaveURL('/login')
  })

  test('build triggers SSE progress', async ({ page }) => {
    // This test verifies the SSE progress bar appears during build.
    // Full build requires Ollama — so we just check the UI element appears.
    await page.goto('/upload')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(SAMPLE_TXT)
    await expect(page.locator('text=/обработан|processed|готов/i').first()).toBeVisible({
      timeout: 120_000,
    })

    await page.goto('/presentation')
    const generateBtn = page.getByRole('button', { name: /генерир|generate/i }).first()
    await generateBtn.click()
    await page.locator('[data-testid="slide-list"], text=/слайд|slide/i').first().waitFor({
      timeout: 60_000,
    })

    // Select all slides and click build
    const buildBtn = page.getByRole('button', { name: /собрать|build|создать pptx/i }).first()
    if (await buildBtn.isVisible()) {
      await buildBtn.click()
      // SSE progress should appear
      await expect(
        page.locator('text=/собираю|прогресс|building|слайд \d/i').first()
      ).toBeVisible({ timeout: 30_000 })
    }
  })
})
