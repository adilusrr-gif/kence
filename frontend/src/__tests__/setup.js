import '@testing-library/jest-dom'

// Load real Russian translations so tests assert on actual user-visible text
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruTranslations = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/locales/ru/translation.json'), 'utf8')
)

function getNestedKey(obj, dotPath) {
  return dotPath.split('.').reduce((acc, k) => acc?.[k], obj)
}

function mockT(key, opts) {
  const value = getNestedKey(ruTranslations, key) ?? key
  if (!opts) return value
  return String(value).replace(/\{\{(\w+)\}\}/g, (_, k) => opts[k] ?? k)
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: { changeLanguage: vi.fn(), language: 'ru' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  Trans: ({ children }) => children,
}))

// Silence framer-motion warnings in test env
vi.mock('framer-motion', () => {
  const React = require('react')
  const motion = new Proxy({}, {
    get: (_, tag) => React.forwardRef(({ children, ...props }, ref) =>
      React.createElement(tag, { ...props, ref }, children)
    ),
  })
  return {
    motion,
    AnimatePresence: ({ children }) => children,
    useAnimation: () => ({ start: vi.fn() }),
    useInView: () => false,
  }
})

// Mock IntersectionObserver
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
