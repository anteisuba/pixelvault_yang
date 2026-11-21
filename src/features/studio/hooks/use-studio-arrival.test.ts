// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/types/model-option'
import { message } from '@/test/app-harness'
import { FAKE_GENERATION } from '@/test/api-helpers'
import { fakeStudioServer, renderHookWithStudio } from '@/test/studio-harness'
import { useStudioArrival } from './use-studio-arrival'
import { useStudioTemplateApply } from './use-studio-template-apply'

/**
 * 「做同款 / 使用模板」跨页到达（`?remix=` / `?template=`）：同一个入口、同一个
 * `applyPreset`、同一条「已套用 · 撤销」；装一次就把参数拿掉。
 */

const mocks = vi.hoisted(() => ({
  search: '',
  replace: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => '/studio/image',
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

const GEMINI: StudioModelOption = {
  optionId: 'key:gemini',
  modelId: 'gemini-3.1-flash-image-preview',
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: { label: 'Gemini', baseUrl: 'https://example.com' },
  requestCount: 1,
  isBuiltIn: true,
  sourceType: 'saved',
  keyId: 'gemini',
}

const NAI: StudioModelOption = {
  ...GEMINI,
  optionId: 'key:nai',
  modelId: 'nai-diffusion-4-5-full',
  adapterType: AI_ADAPTER_TYPES.NOVELAI,
  providerConfig: { label: 'NovelAI', baseUrl: 'https://example.com' },
  keyId: 'nai',
}

const ok = (data: unknown) => Response.json({ success: true, data })
const notFound = () =>
  Response.json({ success: false, error: 'Not found' }, { status: 404 })

function renderArrival(ready = true) {
  return renderHookWithStudio(() => {
    const apply = useStudioTemplateApply([GEMINI])
    useStudioArrival({
      ready,
      modelOptions: [GEMINI],
      applyTemplate: apply.apply,
      applyRemix: apply.applyRemix,
    })
    return apply
  })
}

describe('useStudioArrival', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search = ''
  })
  afterEach(() => vi.unstubAllGlobals())

  it('?template=（图片模板）：型号 · 提示词 · 负面 · 比例都套上，出撤销条，参数拿掉', async () => {
    mocks.search = 'template=r1&x=1'
    fakeStudioServer().on('GET', `${API_ENDPOINTS.RECIPES}/:id`, () =>
      ok({
        id: 'r1',
        name: '雨夜',
        outputType: 'IMAGE',
        modelId: 'gemini-3.1-flash-image-preview',
        compiledPrompt: 'rainy night portrait',
        negativePrompt: 'blurry',
        version: 2,
        params: { aspectRatio: '16:9' },
      }),
    )

    const { result } = renderArrival()

    await waitFor(() =>
      expect(result.current.studio.state.prompt).toBe('rainy night portrait'),
    )
    const state = result.current.studio.state
    expect(state.selectedOptionId).toBe('key:gemini')
    expect(state.aspectRatio).toBe('16:9')
    expect(state.advancedParams.negativePrompt).toBe('blurry')
    expect(state.recipeUsage).toMatchObject({
      recipeId: 'r1',
      recipeVersion: 2,
    })
    expect(result.current.value.appliedName).toBe('雨夜')
    expect(mocks.replace).toHaveBeenCalledWith('/studio/image?x=1', {
      scroll: false,
    })
  })

  it('⭐ 标签台 ?template=（NAI 图片模板）：型号选上、标签拆开、撤销条有名字（同一个 track）', async () => {
    mocks.search = 'template=gta'
    fakeStudioServer().on('GET', `${API_ENDPOINTS.RECIPES}/:id`, () =>
      ok({
        id: 'gta',
        name: 'gta娅娅',
        outputType: 'IMAGE',
        modelId: 'nai-diffusion-4-5-full',
        compiledPrompt: '1girl, character design',
        negativePrompt: 'lowres',
        version: 1,
        params: {},
      }),
    )
    const { result } = renderHookWithStudio(() => {
      const apply = useStudioTemplateApply([GEMINI, NAI])
      useStudioArrival({
        ready: true,
        modelOptions: [GEMINI, NAI],
        applyTemplate: apply.apply,
        applyRemix: apply.applyRemix,
      })
      return apply
    })
    act(() => {
      result.current.studio.dispatch({
        type: 'SET_PROMPT_DIALECT',
        payload: 'tags',
      })
    })

    await waitFor(() =>
      expect(result.current.value.appliedName).toBe('gta娅娅'),
    )
    const state = result.current.studio.state
    expect(state.selectedOptionId).toBe('key:nai')
    expect(state.tagChips.map((chip) => chip.text)).toEqual([
      '1girl',
      'character design',
    ])
    expect(state.tagNegativeChips.map((chip) => chip.text)).toEqual(['lowres'])
  })

  it('没就位（草稿还没回灌）先不套', async () => {
    mocks.search = 'template=r1'
    const server = fakeStudioServer()
    renderArrival(false)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(server.requests.some((r) => r.path.startsWith('/api/recipes'))).toBe(
      false,
    )
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('?remix=（自己的作品）：取整行套上，说「已套用这件作品的设置」', async () => {
    mocks.search = 'remix=g1'
    fakeStudioServer().on('GET', `${API_ENDPOINTS.GENERATIONS}/:id`, () =>
      ok({
        ...FAKE_GENERATION,
        id: 'g1',
        prompt: 'my own prompt',
        negativePrompt: 'lowres',
        model: 'gemini-3.1-flash-image-preview',
        width: 1024,
        height: 1024,
        snapshot: null,
      }),
    )

    const { result } = renderArrival()

    await waitFor(() =>
      expect(result.current.studio.state.prompt).toBe('my own prompt'),
    )
    expect(result.current.studio.state.selectedOptionId).toBe('key:gemini')
    expect(result.current.studio.state.advancedParams.negativePrompt).toBe(
      'lowres',
    )
    expect(result.current.value.appliedMessage).toBe(
      message('StudioTemplates.appliedRemix'),
    )
    expect(mocks.replace).toHaveBeenCalledWith('/studio/image', {
      scroll: false,
    })
  })

  it('?remix=（别人公开的）：本人接口 404 → 走公开配方，只带它给的那几格', async () => {
    mocks.search = 'remix=g2'
    fakeStudioServer()
      .on('GET', `${API_ENDPOINTS.GENERATIONS}/:id`, notFound)
      .on('GET', `${API_ENDPOINTS.GENERATIONS}/:id/replay`, () =>
        ok({
          generationId: 'g2',
          styleCodes: [],
          hasHiddenLoras: false,
          prompt: 'their public prompt',
          seed: 99,
          negativePrompt: null,
          aspectRatio: '9:16',
          modelId: 'gemini-3.1-flash-image-preview',
        }),
      )

    const { result } = renderArrival()

    await waitFor(() =>
      expect(result.current.studio.state.prompt).toBe('their public prompt'),
    )
    const state = result.current.studio.state
    expect(state.aspectRatio).toBe('9:16')
    expect(state.advancedParams.seed).toBe(99)
    expect(state.selectedOptionId).toBe('key:gemini')
  })

  it('两条都取不到：说一句，⛔ 半套', async () => {
    mocks.search = 'remix=g3'
    fakeStudioServer()
      .on('GET', `${API_ENDPOINTS.GENERATIONS}/:id`, notFound)
      .on('GET', `${API_ENDPOINTS.GENERATIONS}/:id/replay`, notFound)

    const { result } = renderArrival()

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        message('StudioTemplates.remixLoadFailed'),
      ),
    )
    expect(result.current.value.appliedName).toBeNull()
  })
})
