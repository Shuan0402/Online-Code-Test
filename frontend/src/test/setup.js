import '@testing-library/jest-dom'
import { vi } from 'vitest'

/**
 * Node 22+ ships a built-in `localStorage` global that lacks the full
 * Web Storage API (no setItem / getItem / clear / removeItem). We replace it
 * with a Map-backed mock so tests can use localStorage normally.
 *
 * This stub is installed once before all tests and reset between tests.
 */
function createLocalStorageMock() {
  let store = {}
  return {
    getItem: vi.fn((key) =>
      Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    ),
    setItem: vi.fn((key, value) => {
      store[key] = String(value)
    }),
    removeItem: vi.fn((key) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index) => Object.keys(store)[index] ?? null),
    _reset() {
      store = {}
      vi.clearAllMocks()
    },
  }
}

const localStorageMock = createLocalStorageMock()

// Install the mock globally so tests (and the source modules that import
// localStorage directly) all use the same mock instance.
vi.stubGlobal('localStorage', localStorageMock)

// Reset data and clear mock call counts between tests.
afterEach(() => {
  localStorageMock._reset()
})
