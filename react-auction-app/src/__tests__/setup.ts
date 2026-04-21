import '@testing-library/jest-dom/vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
Object.defineProperty(globalThis, 'sessionStorage', { value: localStorageMock });

// Mock import.meta.env
(globalThis as Record<string, unknown>).__VITE_ENV__ = {
  VITE_GOOGLE_SHEET_ID: 'test-sheet-id',
  VITE_GOOGLE_API_KEY: 'test-api-key',
};
