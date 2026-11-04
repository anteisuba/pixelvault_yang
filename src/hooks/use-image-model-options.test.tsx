/**
 * L2b：真型号目录 + 真 `ApiKeysProvider`（不自动拉，名单为空）+ 真 `StudioProvider`（真表单 reducer）。
 * 断言她看到哪些型号、切型号之后表单里的专属值最后剩下什么——不断言派发了什么 action。
 */
import type { ReactNode } from 'react'
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Comfy Runner 档（Qwen 与 LoRA 底模）在线上开着；目录在模块加载时读这个开关。
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FF_COMFY_RUNNER = 'true'
})

import {
  AI_MODELS,
  getAvailableImageModels,
  IMAGE_KIND,
} from '@/constants/models'

// 默认型号自动补位只在 `/studio/image` 路由上开火；这里只关心目录与切换后的值。
vi.mock('next/navigation', () => ({
  usePathname: () => '/zh/studio/video',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/video',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user-a', isLoaded: true, isSignedIn: true }),
}))

import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { StudioProvider, useStudioForm } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { renderHookWithApp } from '@/test/app-harness'
import { studioServer } from '@/test/studio-harness'

function Bench({ children }: { children: ReactNode }) {
  return (
    <ApiKeysProvider autoLoad={false}>
      <StudioProvider>{children}</StudioProvider>
    </ApiKeysProvider>
  )
}

function renderOptions() {
  return renderHookWithApp(
    () => ({ form: useStudioForm(), options: useImageModelOptions() }),
    { inner: Bench },
  )
}

type Bench = ReturnType<typeof renderOptions>['result']
const dispatch = (result: Bench) => result.current.form.dispatch

describe('useImageModelOptions', () => {
  beforeEach(() => {
    window.localStorage.clear()
    studioServer()
  })

  // 切模型 = 直接切（批注 36）：新模型不认识的**专属**值整个删掉（删 = 回默认），
  // 通用值（规格 / seed）一个都不动。⛔ 不写「上一个模型的快照」。
  it('drops unsupported 2.5 quality when switching back to GPT Image 2', () => {
    const { result } = renderOptions()
    act(() =>
      dispatch(result)({
        type: 'SET_ADVANCED_PARAMS',
        payload: { resolution: '2K', quality: 'max', seed: 42 },
      }),
    )

    act(() =>
      dispatch(result)({
        type: 'SET_OPTION_ID',
        payload: `workspace:${AI_MODELS.OPENAI_GPT_IMAGE_2}`,
      }),
    )

    expect(result.current.options.selectedModel?.modelId).toBe(
      AI_MODELS.OPENAI_GPT_IMAGE_2,
    )
    expect(result.current.form.state.advancedParams).toEqual({
      resolution: '2K',
      seed: 42,
    })
  })

  it('lists only generation entries, keeping LoRA bases out of Image Studio', () => {
    const { result } = renderOptions()

    const listed = result.current.options.modelOptions.map((m) => m.modelId)
    const loraBases = getAvailableImageModels(IMAGE_KIND.LORA_BASE).map(
      (m) => m.id,
    )
    expect(listed).toEqual(
      getAvailableImageModels(IMAGE_KIND.GENERATE).map((m) => m.id),
    )
    expect(loraBases.length).toBeGreaterThan(0)
    expect(listed.some((id) => (loraBases as string[]).includes(id))).toBe(
      false,
    )
  })

  it('shows Qwen to everyone (owner 2026-11-02 dropped the evaluation allow-list)', () => {
    const { result } = renderOptions()
    expect(
      result.current.options.modelOptions.some(
        (model) => model.modelId === AI_MODELS.QWEN_IMAGE_21_RUNNER,
      ),
    ).toBe(true)
  })

  // 多选表单保留任一已选模型支持的值；去掉那一个之后才按剩下的裁。
  // （真目录里 PixAI 三档都没上架，标签台凑不出两家；换自然语言台的 GPT + Seedream。）
  it.each([false, true])(
    'keeps both models values while both are picked (Seedream primary=%s), then prunes on deselection',
    (seedreamPrimary) => {
      const gpt = `workspace:${AI_MODELS.OPENAI_GPT_IMAGE_2}`
      const seedream = `workspace:${AI_MODELS.SEEDREAM_50_VOLCENGINE}`
      const [primary, extra] = seedreamPrimary
        ? [seedream, gpt]
        : [gpt, seedream]
      const { result } = renderOptions()
      act(() => {
        dispatch(result)({ type: 'SET_OPTION_ID', payload: primary })
        dispatch(result)({ type: 'TOGGLE_EXTRA_MODEL', payload: extra })
        dispatch(result)({
          type: 'SET_ADVANCED_PARAMS',
          payload: { quality: 'high', guidanceScale: 5, seed: 42 },
        })
      })
      expect(result.current.form.state.advancedParams).toEqual({
        quality: 'high',
        guidanceScale: 5,
        seed: 42,
      })

      act(() =>
        dispatch(result)({
          type: 'SET_ADVANCED_PARAMS',
          payload: { quality: 'low', guidanceScale: 7, seed: 42 },
        }),
      )
      expect(result.current.form.state.advancedParams).toEqual({
        quality: 'low',
        guidanceScale: 7,
        seed: 42,
      })

      act(() =>
        dispatch(result)({ type: 'REMOVE_EXTRA_MODEL', payload: extra }),
      )
      expect(result.current.form.state.advancedParams).toEqual(
        seedreamPrimary
          ? { guidanceScale: 7, seed: 42 }
          : { quality: 'low', seed: 42 },
      )
    },
  )
})
