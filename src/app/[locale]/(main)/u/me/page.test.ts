import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@/i18n/navigation', () => ({
  redirect: vi.fn(() => 'REDIRECTED'),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
  getCreatorProfile: vi.fn(),
}))

vi.mock('@/components/business/CreatorProfileView', () => ({
  CreatorProfileView: () => null,
}))

import { generateMetadata } from './page'
import { ensureUser } from '@/services/user.service'

const mockEnsureUser = vi.mocked(ensureUser)

const params = Promise.resolve({ locale: 'zh' as const })

/**
 * `/u/me` 与 `/u/<username>` 是同一张脸的两个地址，正本是带用户名那个
 * （owner 2026-09-20）。这些用例钉住的就是「指向别处」这件事本身 ——
 * 别有人顺手把它改成自指，那会让两个地址互相争正本。
 */
describe('/u/me metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://pixelvault.app')
    mockAuth.mockResolvedValue({ userId: 'clerk-1' })
    mockEnsureUser.mockResolvedValue({
      id: 'db-user-1',
      username: 'yining120224',
      displayName: 'YINIG',
    } as unknown as Awaited<ReturnType<typeof ensureUser>>)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('names the username address as the canonical, not itself', async () => {
    const metadata = await generateMetadata({ params })
    expect(metadata.alternates?.canonical).toBe(
      'https://pixelvault.app/zh/u/yining120224',
    )
  })

  it('sends og:url to that same address so the two signals agree', async () => {
    const metadata = await generateMetadata({ params })
    expect(metadata.openGraph?.url).toBe(
      'https://pixelvault.app/zh/u/yining120224',
    )
  })

  it('stays out of hreflang — the canonical already points elsewhere', async () => {
    const metadata = await generateMetadata({ params })
    expect(metadata.alternates?.languages).toBeUndefined()
  })

  it('never answers the duplicate with noindex — the canonical did that', async () => {
    const metadata = await generateMetadata({ params })
    expect(metadata.robots).toBeUndefined()
  })

  it('says nothing at all for a visitor with no session', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    await expect(generateMetadata({ params })).resolves.toEqual({})
    expect(mockEnsureUser).not.toHaveBeenCalled()
  })
})
