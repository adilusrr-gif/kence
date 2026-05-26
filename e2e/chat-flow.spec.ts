/**
 * E2E: Full RAG chat flow
 * Login → upload document → ask question → receive answer
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import { login } from './helpers'

const SAMPLE_TXT = path.join(__dirname, 'fixtures', 'sample.txt')

test.describe('Chat flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('uploads document and receives chat answer', async ({ page }) => {
    // 1. Navigate to upload
    await page.goto('/upload')

    // 2. Upload fixture document
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(SAMPLE_TXT)

    // 3. Wait for processing to complete
    await expect(page.locator('text=/обработан|processed|готов/i').first()).toBeVisible({
      timeout: 120_000,
    })

    // 4. Navigate to workspace / chat
    await page.goto('/workspace')

    // 5. Send a question
    const chatInput = page.getByPlaceholder(/вопрос|question|спросить/i)
    await chatInput.fill('О чём этот документ?')
    await chatInput.press('Enter')

    // 6. Wait for answer
    await expect(page.locator('[data-role="assistant"], .chat-bubble--assistant').first()).toBeVisible({
      timeout: 60_000,
    })
  })

  test('shows error when no document uploaded', async ({ page }) => {
    // Create a fresh session without document
    await page.goto('/')
    await page.goto('/workspace')
    // Should show placeholder or empty state
    await expect(page.locator('text=/загрузите|upload/i').first()).toBeVisible()
  })
})
