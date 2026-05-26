/**
 * E2E: Document comparison flow
 * Login → upload two documents → run semantic comparison → view results
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import { login } from './helpers'

const DOC1 = path.join(__dirname, 'fixtures', 'sample.txt')
const DOC2 = path.join(__dirname, 'fixtures', 'sample2.txt')

test.describe('Comparison flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('uploads two documents and runs semantic comparison', async ({ page }) => {
    await page.goto('/compare')

    // Upload both files
    const inputs = await page.locator('input[type="file"]').all()
    expect(inputs.length).toBeGreaterThanOrEqual(2)

    await inputs[0].setInputFiles(DOC1)
    await inputs[1].setInputFiles(DOC2)

    // Click upload/compare button
    const uploadBtn = page.getByRole('button', { name: /загрузить|сравнить|upload|compare/i }).first()
    await uploadBtn.click()

    // Expect results or success state
    await expect(
      page.locator('text=/сходство|semantic|similarity|результат/i').first()
    ).toBeVisible({ timeout: 120_000 })
  })

  test('navigation to /compare renders comparison page', async ({ page }) => {
    await page.goto('/compare')
    await expect(page.locator('text=/сравнение|comparison/i').first()).toBeVisible()
  })
})
