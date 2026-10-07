import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiKeysResponse, UserApiKeyRecord } from '@/types'

const auth = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true as boolean | undefined,
  userId: 'user-1' as string | null,
}))
vi.mock('@clerk/nextjs', () => ({ useAuth: () => auth }))

// ⚠ `t` 必须是同一个引用：它在加载 effect 的依赖里，每次渲染换一个会反复重启加载。
const t = vi.hoisted(() => (key: string) => key)
vi.mock('next-intl', () => ({ useTranslations: () => t }))

vi.mock('@/lib/defer-to-idle', () => ({
  deferToIdle: (task: () => void) => {
    task()
    return () => {}
  },
}))

vi.mock('@/lib/api-client', () => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  updateApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  verifyApiKey: vi.fn(),
}))

import { listApiKeys } from '@/lib/api-client'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { useApiKeys } from './use-api-keys'

function keyRecord(id: string): UserApiKeyRecord {
  return {
    id,
    modelId: 'nai-diffusion-4-5-curated',
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    label: 'NovelAI',
    maskedKey: 'pst-…abcd',
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  }
}

/** 一次手动放行的名单请求 —— 用来停在「请求在飞」那一刻断言。 */
function pendingList() {
  let resolve!: (response: ApiKeysResponse) => void
  vi.mocked(listApiKeys).mockReturnValueOnce(
    new Promise<ApiKeysResponse>((done) => {
      resolve = done
    }),
  )
  return (response: ApiKeysResponse) => resolve(response)
}

beforeEach(() => {
  vi.mocked(listApiKeys).mockReset()
  auth.isLoaded = true
  auth.isSignedIn = true
})

// ⚠ 名单缓存是模块级、按用户存的 —— 每个用例用自己的 userId，免得读到上一个的缓存。
describe('useApiKeys · hasLoaded（名单到没到）', () => {
  it('请求在飞时是 false（空名单 ≠ 没有 key），回来之后是 true', async () => {
    auth.userId = 'user-pending'
    const release = pendingList()
    const { result } = renderHook(() => useApiKeys())

    expect(result.current.keys).toEqual([])
    expect(result.current.hasLoaded).toBe(false)

    release({ success: true, data: [keyRecord('k-1')] })
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    expect(result.current.keys).toHaveLength(1)
  })

  it('换了一个用户：上一位的名单不算，等这一位的回来', async () => {
    auth.userId = 'user-a'
    vi.mocked(listApiKeys).mockResolvedValueOnce({
      success: true,
      data: [keyRecord('k-a')],
    })
    const { result, rerender } = renderHook(() => useApiKeys())
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))

    auth.userId = 'user-b'
    const release = pendingList()
    rerender()
    expect(result.current.hasLoaded).toBe(false)

    release({ success: true, data: [] })
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    expect(result.current.keys).toEqual([])
  })

  it('请求失败：仍是 false —— 不知道，不是没有', async () => {
    auth.userId = 'user-failed'
    vi.mocked(listApiKeys).mockResolvedValueOnce({
      success: false,
      error: 'boom',
    })
    const { result } = renderHook(() => useApiKeys())
    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.hasLoaded).toBe(false)
  })

  it('Clerk 还没认出人：false，也不发请求', () => {
    auth.isLoaded = false
    auth.userId = null
    const { result } = renderHook(() => useApiKeys())
    expect(result.current.hasLoaded).toBe(false)
    expect(listApiKeys).not.toHaveBeenCalled()
  })

  it('未登录：名单确定为空，true', () => {
    auth.isSignedIn = false
    auth.userId = null
    const { result } = renderHook(() => useApiKeys())
    expect(result.current.hasLoaded).toBe(true)
    expect(result.current.keys).toEqual([])
  })
})
