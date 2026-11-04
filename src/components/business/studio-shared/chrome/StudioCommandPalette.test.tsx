import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'

import { API_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { keySettingsPath } from '@/constants/routes'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  settle,
} from '@/test/studio-harness'

import { StudioCommandPalette } from '@/components/business/studio-shared/chrome/StudioCommandPalette'

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// key 名单有模块级缓存（按用户），每例换一个用户 = 每例都是「第一次拉」。
const clerk = vi.hoisted(() => ({ userId: 'palette-0', seq: 0 }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: clerk.userId }),
}))
const push = vi.hoisted(() => vi.fn())
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/video',
  useRouter: () => ({ push }),
}))

const ok = (data: unknown) => Response.json({ success: true, data })

/** 只配了 fal 的一把 key（绑在 Seedance 2.5 上）。 */
const FAL_KEY = {
  id: 'key-1',
  modelId: AI_MODELS.SEEDANCE_25,
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
  label: 'fal',
  maskedKey: '••••',
  isActive: true,
  createdAt: new Date(0).toISOString(),
}

const label = (key: string) => text(`Models.${key}.label`)
/** 没有 key 的那家：Gemini Omni Flash（Gemini）。 */
const MISSING = () => label('geminiOmniFlash')

let server: ReturnType<typeof fakeStudioServer>
beforeEach(() => {
  clerk.userId = `palette-${++clerk.seq}`
  push.mockClear()
  server = fakeStudioServer().on('GET', API_ENDPOINTS.API_KEYS, () =>
    ok([FAL_KEY]),
  )
  // key 名单等浏览器空闲才拉（`deferToIdle`）：测试里空闲就是马上。
  vi.stubGlobal('requestIdleCallback', (task: () => void) =>
    setTimeout(task, 0),
  )
  vi.stubGlobal('cancelIdleCallback', (id: number) => clearTimeout(id))
})
afterEach(() => vi.unstubAllGlobals())

/** 真工作台切到视频档，等 key 名单（要等的话）回来，再按 Ctrl+K。 */
async function openPalette({ waitForKeys = true } = {}) {
  const view = renderWithStudio(<StudioCommandPalette />)
  act(() =>
    view.studio.current.dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' }),
  )
  if (waitForKeys) {
    await waitFor(() =>
      expect(server.requests).toContainEqual({
        method: 'GET',
        path: API_ENDPOINTS.API_KEYS,
      }),
    )
    await settle()
  }
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
  return view.studio
}

describe('StudioCommandPalette', () => {
  it('lists models for the current output type', async () => {
    await openPalette()
    expect(screen.getAllByText(label('klingO3Pro')).length).toBeGreaterThan(0)
    // 图片档的型号不在视频档的名单里。
    expect(screen.queryByText(label('openaiGptImage2'))).not.toBeInTheDocument()
  })

  it('没配 key 的模型选不上：不改当前模型，直接去配它那一家的 key', async () => {
    const studio = await openPalette()
    const before = studio.current.state.selectedOptionId

    fireEvent.click(screen.getAllByText(MISSING())[0]!)

    expect(studio.current.state.selectedOptionId).toBe(before)
    expect(push).toHaveBeenCalledWith(
      keySettingsPath('/studio/video', AI_ADAPTER_TYPES.GEMINI),
    )
  })

  it('配好 key 的模型照常选中', async () => {
    const studio = await openPalette()

    fireEvent.click(screen.getAllByText(label('klingO3Pro'))[0]!)

    expect(studio.current.state.selectedOptionId).toMatch(
      new RegExp(AI_MODELS.KLING_O3_PRO),
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('key 名单还没回来：不知道缺不缺，照常选中、⛔ 不跳配置页', async () => {
    server.on('GET', API_ENDPOINTS.API_KEYS, () => new Promise(() => {}))
    const studio = await openPalette({ waitForKeys: false })

    fireEvent.click(screen.getAllByText(MISSING())[0]!)

    expect(studio.current.state.selectedOptionId).toMatch(/gemini-omni-flash/)
    expect(push).not.toHaveBeenCalled()
  })
})
