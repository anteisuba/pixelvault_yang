import '@testing-library/jest-dom/vitest'

// Mock server-only module so API route tests can import factory functions
vi.mock('server-only', () => ({}))
