import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.fn<() => Promise<{ userId: string | null }>>()

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock('@/services/generation.service', () => ({
  getGenerationByIdForUser: vi.fn(),
}))

vi.mock('@/services/project.service', () => ({
  listProjects: vi.fn(async () => []),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'db-user-1' })),
}))

vi.mock('@/components/business/AssetDetailContent', () => ({
  AssetDetailContent: () => null,
}))

import AssetDetailPage, { generateMetadata } from './page'
import { getGenerationByIdForUser } from '@/services/generation.service'

const mockGetGeneration = vi.mocked(getGenerationByIdForUser)

const OWNED_GENERATION = {
  id: 'gen-1',
  model: 'flux-dev',
  prompt: 'a quiet harbour at dawn',
  url: 'https://cdn.example/gen-1.png',
  previewUrl: null,
  outputType: 'IMAGE',
} as unknown as Awaited<ReturnType<typeof getGenerationByIdForUser>>

const params = Promise.resolve({ locale: 'en' as const, id: 'gen-1' })

describe('/assets/[id] detail page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'clerk-1' })
  })

  it('renders the shared detail body for the owner', async () => {
    mockGetGeneration.mockResolvedValue(OWNED_GENERATION)
    await expect(AssetDetailPage({ params })).resolves.toBeTruthy()
    expect(mockGetGeneration).toHaveBeenCalledWith('gen-1', 'db-user-1')
  })

  it('404s instead of 403 when the asset belongs to somebody else', async () => {
    mockGetGeneration.mockResolvedValue(null)
    await expect(AssetDetailPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('404s for signed-out visitors without querying the asset', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    await expect(AssetDetailPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockGetGeneration).not.toHaveBeenCalled()
  })

  it('keeps private assets out of metadata when they are not the viewer’s', async () => {
    mockGetGeneration.mockResolvedValue(null)
    await expect(generateMetadata({ params })).resolves.toMatchObject({
      title: 'Not Found',
      robots: 'noindex, nofollow',
    })
  })

  it('builds a titled, noindex metadata card with a cover for the owner', async () => {
    mockGetGeneration.mockResolvedValue(OWNED_GENERATION)
    const metadata = await generateMetadata({ params })
    expect(metadata.title).toContain('flux-dev')
    expect(metadata.robots).toBe('noindex, nofollow')
    expect(metadata.openGraph?.images).toEqual([
      { url: 'https://cdn.example/gen-1.png' },
    ])
  })
})
