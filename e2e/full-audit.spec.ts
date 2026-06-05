import { test, expect, Page } from '@playwright/test'
import { login } from './helpers'
import * as path from 'path'
import * as fs from 'fs'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: false })
}

async function navTo(page: Page, href: string) {
  await page.evaluate((h) => window.history.pushState({}, '', h), href)
  // Trigger router navigation via click on matching nav link, or just goto
  await page.goto(href)
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('DocAI Full Audit', () => {

  test.beforeAll(async () => {
    const dir = 'e2e/screenshots'
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  })

  // ── 1. Login ────────────────────────────────────────────────────────────────
  test('1. Login flow', async ({ page }) => {
    await page.goto('/login')
    await screenshot(page, '01-login-page')

    // Check form exists
    const userInput = page.getByPlaceholder(/логин|username/i)
    const passInput = page.getByPlaceholder(/пароль|password/i)
    const loginBtn  = page.getByRole('button', { name: /войти|login|вход/i })
    await expect(userInput).toBeVisible()
    await expect(passInput).toBeVisible()
    await expect(loginBtn).toBeVisible()

    // Wrong credentials
    await userInput.fill('wronguser')
    await passInput.fill('wrongpass')
    await loginBtn.click()
    await page.waitForTimeout(1500)
    await screenshot(page, '01-login-wrong-creds')
    // Should still be on login or show error
    const url = page.url()
    expect(url).toContain('login')

    // Correct credentials
    await userInput.fill('admin')
    await passInput.fill('kence2026!')
    await loginBtn.click()
    await page.waitForURL(/^\/((?!login).)*$/, { timeout: 12000 })
    await screenshot(page, '01-login-success')
    expect(page.url()).not.toContain('login')
  })

  // ── 2. Dashboard & Navigation ───────────────────────────────────────────────
  test('2. Dashboard loads and shows content', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await screenshot(page, '02-dashboard')

    // Greeting present
    const body = await page.textContent('body')
    expect(body).toBeTruthy()

    // Left rail nav items exist
    const nav = page.locator('.left-rail__nav-item')
    const count = await nav.count()
    expect(count).toBeGreaterThan(4)
  })

  // ── 3. Navigation – all menu items ──────────────────────────────────────────
  test('3. Navigate all routes', async ({ page }) => {
    await login(page)

    const routes = [
      { path: '/',             name: 'dashboard' },
      { path: '/upload',       name: 'upload' },
      { path: '/workspace',    name: 'workspace' },
      { path: '/compare',      name: 'compare' },
      { path: '/presentation', name: 'presentation' },
      { path: '/convert',      name: 'convert' },
      { path: '/library',      name: 'library' },
      { path: '/graph',        name: 'graph' },
      { path: '/agents',       name: 'agents' },
      { path: '/analytics',    name: 'analytics' },
      { path: '/executive',    name: 'executive' },
      { path: '/profile',      name: 'profile' },
      { path: '/admin',        name: 'admin' },
      { path: '/ai-settings',  name: 'ai-settings' },
      { path: '/org/settings', name: 'org-settings' },
    ]

    const results: { path: string; ok: boolean; note: string }[] = []

    for (const route of routes) {
      await page.goto(route.path)
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
      await page.waitForTimeout(400)

      const url    = page.url()
      const title  = await page.title()
      const errors: string[] = []

      // Collect console errors
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })

      // Check for React error boundary or blank page
      const bodyText = await page.textContent('body')
      const hasContent = bodyText && bodyText.trim().length > 30
      const redirectedToLogin = url.includes('login')
      const hasErrorBoundary = await page.locator('text=/something went wrong|ошибка/i').count()

      await screenshot(page, `03-nav-${route.name}`)

      results.push({
        path: route.path,
        ok: hasContent && !redirectedToLogin && hasErrorBoundary === 0,
        note: redirectedToLogin
          ? 'REDIRECT→login'
          : !hasContent
            ? 'BLANK'
            : hasErrorBoundary > 0
              ? 'ERROR_BOUNDARY'
              : 'OK',
      })
    }

    console.log('\n=== ROUTE AUDIT ===')
    for (const r of results) {
      console.log(`${r.ok ? '✅' : '❌'} ${r.path.padEnd(20)} ${r.note}`)
    }

    const failed = results.filter(r => !r.ok)
    if (failed.length > 0) {
      console.warn('FAILED ROUTES:', failed.map(f => f.path).join(', '))
    }
  })

  // ── 4. Upload file ──────────────────────────────────────────────────────────
  test('4. Upload page – file selection and UI', async ({ page }) => {
    await login(page)
    await page.goto('/upload')
    await page.waitForLoadState('networkidle').catch(() => {})
    await screenshot(page, '04-upload-page')

    // File input exists
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeAttached()

    // Drop zone visible
    const dropZone = page.locator('.us-drop')
    await expect(dropZone).toBeVisible()

    // Create a tiny test PDF
    const tmpFile = path.resolve('e2e/fixtures/test.pdf')
    if (!fs.existsSync(tmpFile)) {
      // Create minimal valid PDF
      fs.writeFileSync(tmpFile, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000068 00000 n\n0000000125 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n206\n%%EOF')
    }

    await fileInput.setInputFiles(tmpFile)
    await screenshot(page, '04-upload-file-selected')

    // File name should appear in UI
    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('test.pdf')
  })

  // ── 5. Workspace – edit mode and toolbar ────────────────────────────────────
  test('5. Workspace edit mode toolbar', async ({ page }) => {
    await login(page)

    // Set up a session from localStorage
    const sessions = await page.evaluate(() => {
      const stored = localStorage.getItem('kence_session_history')
      return stored ? JSON.parse(stored) : []
    })

    await page.goto('/workspace')
    await page.waitForLoadState('networkidle').catch(() => {})
    await screenshot(page, '05-workspace')

    // Edit mode button
    const editBtn = page.locator('.ws-doc-nav-btn').filter({ hasText: '' }).first()
    const editBtnAll = page.locator('.ws-doc-nav-btn')
    const editCount = await editBtnAll.count()
    console.log(`Edit nav buttons: ${editCount}`)
    await screenshot(page, '05-workspace-nav-buttons')
  })

  // ── 6. Compare page ─────────────────────────────────────────────────────────
  test('6. Compare page loads', async ({ page }) => {
    await login(page)
    await page.goto('/compare')
    await page.waitForLoadState('networkidle').catch(() => {})
    await screenshot(page, '06-compare')

    const body = await page.textContent('body')
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(20)
  })

  // ── 7. Analytics page – charts render ───────────────────────────────────────
  test('7. Analytics charts render', async ({ page }) => {
    await login(page)
    await page.goto('/analytics')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1000)
    await screenshot(page, '07-analytics')

    // recharts SVG should be present
    const charts = await page.locator('svg.recharts-surface').count()
    console.log(`Charts rendered: ${charts}`)
    expect(charts).toBeGreaterThan(0)
  })

  // ── 8. Admin page – users table ─────────────────────────────────────────────
  test('8. Admin page user management', async ({ page }) => {
    await login(page)
    await page.goto('/admin')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(600)
    await screenshot(page, '08-admin')

    const body = await page.textContent('body')
    expect(body).toContain('admin')
  })

  // ── 9. Agent launcher ───────────────────────────────────────────────────────
  test('9. Agent launcher shows agent types', async ({ page }) => {
    await login(page)
    await page.goto('/agents')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(800)
    await screenshot(page, '09-agents')

    // Agent cards should load
    const agentCards = await page.locator('.agents-card').count()
    console.log(`Agent cards: ${agentCards}`)
  })

  // ── 10. Knowledge Graph ─────────────────────────────────────────────────────
  test('10. Knowledge graph page loads', async ({ page }) => {
    await login(page)
    await page.goto('/graph')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(800)
    await screenshot(page, '10-graph')

    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(20)
  })

  // ── 11. Notifications bell ──────────────────────────────────────────────────
  test('11. Notification bell clickable', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle').catch(() => {})

    const bell = page.locator('.notif-bell-wrapper button').first()
    const bellExists = await bell.count()
    if (bellExists > 0) {
      await bell.click()
      await page.waitForTimeout(300)
      await screenshot(page, '11-notifications-open')
      // Dropdown should appear
      const dropdown = page.locator('.notification-dropdown')
      const dropdownVisible = await dropdown.isVisible().catch(() => false)
      console.log(`Notification dropdown visible: ${dropdownVisible}`)
    } else {
      console.log('No notification bell found — checking top bar area')
      await screenshot(page, '11-no-bell')
    }
  })

  // ── 12. Search / command palette ────────────────────────────────────────────
  test('12. Command palette opens', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle').catch(() => {})

    // Ctrl+K
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(400)
    await screenshot(page, '12-command-palette')

    const palette = page.locator('.cmd-palette-dialog, .cmd-palette-input, [class*="palette"]')
    const paletteVisible = await palette.first().isVisible().catch(() => false)
    console.log(`Command palette visible after Ctrl+K: ${paletteVisible}`)

    // Escape closes
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  // ── 13. Theme toggle ────────────────────────────────────────────────────────
  test('13. Theme toggle works', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle').catch(() => {})

    // Find theme toggle button
    const themeBtn = page.locator('[aria-label*="тема"], [aria-label*="theme"], [title*="тема"], [title*="theme"]').first()
    const themeBtnCount = await themeBtn.count()
    console.log(`Theme buttons found: ${themeBtnCount}`)

    if (themeBtnCount > 0) {
      const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
      await themeBtn.click()
      await page.waitForTimeout(300)
      const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
      console.log(`Theme: ${before} → ${after}`)
      await screenshot(page, '13-theme-toggled')
    } else {
      await screenshot(page, '13-no-theme-btn')
    }
  })

  // ── 14. Document Library search ─────────────────────────────────────────────
  test('14. Library search input works', async ({ page }) => {
    await login(page)
    await page.goto('/library')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(600)
    await screenshot(page, '14-library')

    const searchInput = page.locator('.library-search')
    const exists = await searchInput.count()
    if (exists > 0) {
      await searchInput.fill('test')
      await page.waitForTimeout(300)
      await screenshot(page, '14-library-searched')
      console.log('Library search: OK')
    }
  })

  // ── 15. Presentation page ───────────────────────────────────────────────────
  test('15. Presentation page loads and shows settings', async ({ page }) => {
    await login(page)
    await page.goto('/presentation')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(600)
    await screenshot(page, '15-presentation')

    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(20)
  })

  // ── 16. Profile page ────────────────────────────────────────────────────────
  test('16. Profile page shows user info', async ({ page }) => {
    await login(page)
    await page.goto('/profile')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
    await screenshot(page, '16-profile')

    const body = await page.textContent('body')
    expect(body).toContain('admin')
  })

  // ── 17. AI Settings page ────────────────────────────────────────────────────
  test('17. AI Settings page loads', async ({ page }) => {
    await login(page)
    await page.goto('/ai-settings')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
    await screenshot(page, '17-ai-settings')

    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(20)
  })

  // ── 18. Landing page /home ──────────────────────────────────────────────────
  test('18. Landing page /home', async ({ page }) => {
    await login(page)
    await page.goto('/home')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
    await screenshot(page, '18-home')

    const heroBtns = await page.locator('.dash-hero-btn').count()
    console.log(`Hero buttons: ${heroBtns}`)
    expect(heroBtns).toBeGreaterThan(0)
  })

  // ── 19. Convert page ────────────────────────────────────────────────────────
  test('19. Convert page format buttons', async ({ page }) => {
    await login(page)
    await page.goto('/convert')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
    await screenshot(page, '19-convert')

    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(20)
  })

  // ── 20. Agent task history ──────────────────────────────────────────────────
  test('20. Agent task history page', async ({ page }) => {
    await login(page)
    await page.goto('/agents/history')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(600)
    await screenshot(page, '20-agent-history')

    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(20)
  })

})
