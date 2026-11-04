/**
 * L2a 真库：`/assets/[id]` 单张素材详情页 —— 只有本人看得到，别人的 / 没登录一律 404
 *（⛔ 403：会泄露「这个 id 存在」）；元数据同理，且永远 noindex。
 * 只假 Clerk 登录与 Next 的 `notFound`；服务与库全真。
 */
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const session = vi.hoisted(() => ({ userId: null as string | null }))
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: session.userId }),
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
// 服务端取文案：真文案、真 next-intl 翻译器（测试里没有 Next 的请求上下文）。
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const { MESSAGES } = await import('@/messages')
  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: keyof typeof MESSAGES
      namespace: string
    }) =>
      createTranslator({
        locale,
        messages: MESSAGES[locale],
        namespace: namespace as never,
      }),
  }
})

import AssetDetailPage, { generateMetadata } from './page'
import { db } from '@/lib/db'
import { message } from '@/test/app-harness'
import { createTestUser, resetDatabase } from '@/test/int/db'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>
let mine: { id: string }
let theirs: { id: string }

const params = (id: string) => Promise.resolve({ locale: 'en' as const, id })

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  session.userId = me.clerkId
  const base = {
    storageKey: 'k',
    outputType: 'IMAGE' as const,
    model: 'flux-dev',
    provider: 'fal',
  }
  mine = await db.generation.create({
    data: {
      ...base,
      userId: me.id,
      url: 'https://cdn.example/gen-1.png',
      prompt: 'a quiet harbour at dawn',
    },
  })
  theirs = await db.generation.create({
    data: {
      ...base,
      userId: other.id,
      url: 'https://cdn.example/gen-2.png',
      prompt: 'secret',
    },
  })
  await db.project.create({ data: { userId: me.id, name: '海港' } })
})

describe('/assets/[id] detail page', () => {
  it('renders the shared detail body for the owner, with their folders', async () => {
    const page = (await AssetDetailPage({
      params: params(mine.id),
    })) as ReactElement<{
      generation: { id: string; prompt: string }
      folders: Array<{ name: string }>
    }>
    expect(page.props.generation).toMatchObject({
      id: mine.id,
      prompt: 'a quiet harbour at dawn',
    })
    expect(page.props.folders.map((folder) => folder.name)).toEqual(['海港'])
  })

  it('404s instead of 403 when the asset belongs to somebody else', async () => {
    await expect(
      AssetDetailPage({ params: params(theirs.id) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('404s for signed-out visitors', async () => {
    session.userId = null
    await expect(AssetDetailPage({ params: params(mine.id) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })

  it('keeps private assets out of metadata when they are not the viewer’s', async () => {
    await expect(
      generateMetadata({ params: params(theirs.id) }),
    ).resolves.toEqual({
      title: 'Not Found',
      robots: 'noindex, nofollow',
    })
  })

  it('builds a titled, noindex metadata card with a cover for the owner', async () => {
    const metadata = await generateMetadata({ params: params(mine.id) })
    expect(metadata.title).toBe(
      `flux-dev — ${message('AssetsPage.detailTitle', 'en')}`,
    )
    expect(metadata.robots).toBe('noindex, nofollow')
    expect(metadata.openGraph?.images).toEqual([
      { url: 'https://cdn.example/gen-1.png' },
    ])
  })
})
