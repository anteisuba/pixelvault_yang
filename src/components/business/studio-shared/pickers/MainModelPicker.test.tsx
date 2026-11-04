import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import {
  MainModelPicker,
  routeToStudioOption,
} from '@/components/business/studio-shared/pickers/MainModelPicker'
import type { LLMRouteOption } from '@/hooks/use-llm-route-picker'
import { renderWithApp } from '@/test/app-harness'
import { stubBrowserLayout } from '@/test/browser-stubs'
import {
  fakeStudioServer,
  renderWithStudio,
  settle,
} from '@/test/studio-harness'
import type { UserApiKeyRecord } from '@/types'

/**
 * 按模态取清单的分发器：真 `useImageModelOptions` / `useVideoModelOptions` /
 * `use3DModelOptions` / `useLLMRoutePicker`、真 key 名单、真统一选择器；只假网络。
 * 「分发到哪个 hook」看的是弹层里列出来的是哪一类模型。
 */

const auth = vi.hoisted(() => ({ userId: 'user-0', n: 0 }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: auth.userId }),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/studio/image',
}))

const ok = (data: unknown) => Response.json({ success: true, data })

const FAL_KEY: UserApiKeyRecord = {
  id: 'fal-1',
  modelId: AI_MODELS.SEEDREAM_50_PRO,
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
  label: 'fal',
  maskedKey: 'fal-****',
  isActive: true,
  createdAt: new Date('2026-01-01'),
}

let keys: UserApiKeyRecord[] = []
beforeEach(() => {
  auth.n += 1
  auth.userId = `user-${auth.n}`
  keys = []
  localStorage.clear()
  stubBrowserLayout()
  fakeStudioServer().on('GET', API_ENDPOINTS.API_KEYS, () => ok(keys))
})
afterEach(() => vi.unstubAllGlobals())

/** 点开触发器，读弹层里列出来的每一行。 */
function openRows(): string[] {
  fireEvent.click(screen.getByRole('button', { name: /./ }))
  return Array.from(document.querySelectorAll('[role="option"]')).map(
    (row) => row.getAttribute('aria-label') ?? row.textContent ?? '',
  )
}

const rendered = async () => {
  await settle()
  await settle()
}

describe('MainModelPicker 分发器', () => {
  it('image：列生图模型，⛔ 混进视频', async () => {
    renderWithStudio(
      <MainModelPicker modality="image" value={null} onChange={vi.fn()} />,
    )
    await rendered()
    const rows = openRows()
    expect(rows).toContain('OpenAI GPT Image 2')
    expect(rows).toContain('Seedream 5.0 Pro')
    expect(rows.join()).not.toMatch(/Seedance|Hunyuan3D/)
  })

  it('video：列视频模型，⛔ 混进生图', async () => {
    renderWithStudio(
      <MainModelPicker modality="video" value={null} onChange={vi.fn()} />,
    )
    await rendered()
    const rows = openRows()
    expect(rows).toContain('Seedance 2.0')
    expect(rows.join()).not.toMatch(/GPT Image|Seedream|Hunyuan3D/)
  })

  // 3D 台不包 StudioProvider：3D 那一支若碰了生图 / 视频的 hook（要工作台表单）就会直接崩。
  it('model_3d：不在工作台里也能挂，只列 3D 模型', async () => {
    renderWithApp(
      <MainModelPicker modality="model_3d" value={null} onChange={vi.fn()} />,
      { inner: ApiKeysProvider },
    )
    await rendered()
    const rows = openRows()
    expect(rows).toContain('Hunyuan3D v3')
    expect(rows.join()).not.toMatch(/GPT Image|Seedance/)
  })

  it('llm_assist：按传入的能力列文字模型路线', async () => {
    renderWithApp(
      <MainModelPicker
        modality="llm_assist"
        llmCapability="planner"
        value={null}
        onChange={vi.fn()}
      />,
      { inner: ApiKeysProvider },
    )
    await rendered()
    const rows = openRows()
    expect(rows).toContain('Gemini 3.8 Flash')
    expect(rows.join()).not.toMatch(/GPT Image|Seedance|Hunyuan3D/)
  })

  it('每个模态都是同一颗统一触发器：名与型号两格（D2 ④「五处宿主同一形状」）', async () => {
    keys = [FAL_KEY]
    renderWithStudio(
      <MainModelPicker modality="image" value="key:fal-1" onChange={vi.fn()} />,
    )
    await rendered()
    const chip = screen.getByRole('button', { name: /Seedream/ })
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog')
    expect(chip.textContent).toContain('Seedream')
    expect(chip.textContent).toContain('5.0 Pro')
  })
})

describe('routeToStudioOption', () => {
  it('converts a saved LLM route to a "saved" sourceType StudioModelOption', () => {
    const route: LLMRouteOption = {
      optionId: 'llm-route:planner:key:k1',
      apiKeyId: 'k1',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: 'gpt-4o-mini',
      label: 'OpenAI GPT-5.4 Mini',
      providerLabel: 'OpenAI',
      maskedKey: 'sk-****1234',
      keyLabel: 'My OpenAI',
      isSaved: true,
    }
    const result = routeToStudioOption(route)
    expect(result.sourceType).toBe('saved')
    expect(result.keyId).toBe('k1')
    expect(result.keyLabel).toBe('My OpenAI')
    expect(result.maskedKey).toBe('sk-****1234')
    expect(result.modelId).toBe('gpt-4o-mini')
    expect(result.displayLabel).toBe('OpenAI GPT-5.4 Mini')
  })

  it('converts a locked LLM route to a "workspace" sourceType StudioModelOption', () => {
    const route: LLMRouteOption = {
      optionId: 'llm-route:planner:setup:gpt-4o',
      apiKeyId: null,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: 'gpt-4o',
      label: 'OpenAI GPT-5.4 Mini',
      providerLabel: 'OpenAI',
      isSaved: false,
    }
    const result = routeToStudioOption(route)
    expect(result.sourceType).toBe('workspace')
    expect(result.keyId).toBeUndefined()
    expect(result.displayLabel).toBe('OpenAI GPT-5.4 Mini')
  })

  it('falls back to adapterType when modelId missing (enhance scope)', () => {
    const route: LLMRouteOption = {
      optionId: 'llm-route:enhance:setup-adapter:openai',
      apiKeyId: null,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      label: 'openai',
      providerLabel: 'openai',
      isSaved: false,
    }
    expect(routeToStudioOption(route).modelId).toBe(AI_ADAPTER_TYPES.OPENAI)
  })

  it('没 key 的路线不带 provider 覆盖，落「需要 key」那一桶', () => {
    const result = routeToStudioOption({
      optionId: 'opt',
      apiKeyId: null,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      label: 'Gemini',
      providerLabel: 'Gemini',
      isSaved: false,
    })
    expect(result.sourceType).toBe('workspace')
    expect(result.providerKeyId).toBeUndefined()
  })
})
