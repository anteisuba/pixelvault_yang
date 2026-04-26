/**
 * Shared helpers for testing Next.js App Router API routes.
 */
import { NextRequest } from 'next/server'
import { vi } from 'vitest'

// ─── Mock Clerk Auth ─────────────────────────────────────────────

const mockAuth = vi.fn<() => Promise<{ userId: string | null }>>()

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}))

export function mockAuthenticated(clerkId = 'clerk_test_user') {
  mockAuth.mockResolvedValue({ userId: clerkId })
}

export function mockUnauthenticated() {
  mockAuth.mockResolvedValue({ userId: null })
}

// ─── Mock Rate Limiter ───────────────────────────────────────────

const mockRateLimit = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))

export function mockRateLimitAllowed() {
  mockRateLimit.mockReturnValue({ success: true, remaining: 9 })
}

export function mockRateLimitExceeded() {
  mockRateLimit.mockReturnValue({ success: false, remaining: 0 })
}

// ─── Request Builders ────────────────────────────────────────────

const BASE_URL = 'http://localhost:3000'

export function createGET(path: string, query?: Record<string, string>) {
  const url = new URL(path, BASE_URL)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v)
    }
  }
  return new NextRequest(url)
}

export function createPOST(path: string, body: unknown) {
  return new NextRequest(new URL(path, BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function createPUT(path: string, body: unknown) {
  return new NextRequest(new URL(path, BASE_URL), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function createPATCH(path: string) {
  return new NextRequest(new URL(path, BASE_URL), { method: 'PATCH' })
}

export function createDELETE(path: string) {
  return new NextRequest(new URL(path, BASE_URL), { method: 'DELETE' })
}

// ─── Response Helpers ────────────────────────────────────────────

export async function parseJSON<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

// ─── Fake Data ───────────────────────────────────────────────────

export const FAKE_DB_USER = {
  id: 'db_user_123',
  clerkId: 'clerk_test_user',
  email: 'test@example.com',
  username: 'testuser',
  displayName: 'Test User',
  avatarUrl: null,
  avatarStorageKey: null,
  bannerUrl: null,
  bannerStorageKey: null,
  bio: null,
  civitaiToken: null,
  isPublic: true,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const FAKE_GENERATION = {
  id: 'gen_123',
  createdAt: new Date(),
  outputType: 'IMAGE' as const,
  status: 'COMPLETED' as const,
  url: 'https://storage.example.com/test.png',
  storageKey: 'generations/image/2026-03-23_abc12345.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  duration: null,
  prompt: 'a beautiful sunset',
  negativePrompt: null,
  model: 'sdxl',
  provider: 'huggingface',
  requestCount: 1,
  isPublic: true,
  isPromptPublic: false,
  userId: 'db_user_123',
}
