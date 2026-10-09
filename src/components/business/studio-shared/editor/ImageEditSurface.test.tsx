import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

import { ImageEditSurface } from './ImageEditSurface'

const mocks = vi.hoisted(() => ({
  keys: [] as UserApiKeyRecord[],
  healthMap: {} as Record<string, ApiKeyHealthStatus>,
  /** key 名单回没回来 —— 默认回来了。 */
  keysLoaded: true,
  run: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({
    keys: mocks.keys,
    healthMap: mocks.healthMap,
    hasLoaded: mocks.keysLoaded,
  }),
}))

vi.mock('@/lib/canvas-capability-runtime', () => ({
  canvasCapabilityRuntime: { run: mocks.run },
}))

vi.mock('@/components/business/studio/StudioInpaintEditor', () => ({
  StudioInpaintEditor: () => null,
}))

vi.mock('./ImageAnnotationEditor', () => ({
  ImageAnnotationEditor: () => null,
}))

vi.mock(
  '@/components/business/studio-shared/pickers/ModelPickerPopover',
  () => ({
    // 换模型那颗胶囊在这里退成一个下拉：要验的是「换到哪个渠道就用哪把 key」。
    ModelPickerPopover: ({
      options,
      value,
      onChange,
    }: {
      options: { optionId: string; modelId: string }[]
      value: string | null
      onChange: (option: { optionId: string; modelId: string }) => void
    }) => (
      <select
        aria-label="modelLabel"
        value={options.find((option) => option.optionId === value)?.modelId}
        onChange={(event) => {
          const option = options.find(
            (candidate) => candidate.modelId === event.target.value,
          )
          if (option) onChange(option)
        }}
      >
        {options.map((option) => (
          <option key={option.optionId} value={option.modelId}>
            {option.modelId}
          </option>
        ))}
      </select>
    ),
  }),
)

vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: ({
    modelId,
    adapterType,
    onVerified,
    onOpenChange,
  }: {
    modelId: string
    adapterType: AI_ADAPTER_TYPES
    onVerified: (modelId: string, keyId: string) => void
    onOpenChange: (open: boolean) => void
  }) => (
    <div role="dialog" aria-label={`${modelId}:${adapterType}`}>
      <button
        onClick={() => {
          const key = makeKey(modelId, adapterType)
          mocks.keys = [...mocks.keys, key]
          onVerified(modelId, key.id)
          onOpenChange(false)
        }}
      >
        Verify key
      </button>
    </div>
  ),
}))

function makeKey(
  modelId: string,
  adapterType: AI_ADAPTER_TYPES,
): UserApiKeyRecord {
  return {
    id: `${adapterType}-key`,
    modelId,
    adapterType,
    providerConfig: getDefaultProviderConfig(adapterType),
    label: 'Test key',
    maskedKey: 'test-****',
    isActive: true,
    createdAt: new Date('2026-01-01'),
  }
}

function renderExtraction() {
  return render(
    <ImageEditSurface
      sourceUrl="https://cdn.example.com/original.png"
      defaultTask="extract-element"
      onApplied={() => true}
    />,
  )
}

function configureOpenAI() {
  fireEvent.click(screen.getByRole('button', { name: 'extract.run' }))
  expect(
    screen.getByRole('dialog', {
      name: `gpt-image-2:${AI_ADAPTER_TYPES.OPENAI}`,
    }),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Verify key' }))
}

// jsdom 没有 ResizeObserver：Radix 的开关（反向蒙版）挂载时要它。
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keys = []
  mocks.keysLoaded = true
  mocks.run.mockResolvedValue({
    success: true,
    outputs: [{ imageUrl: 'https://cdn.example.com/extracted.png' }],
  })
})

describe('ImageEditSurface · 提取元素凭据选择', () => {
  it('配置 OpenAI 后切到未配置的 Gemini，提交打开 Gemini 配置而不沿用 OpenAI key', () => {
    renderExtraction()
    configureOpenAI()
    fireEvent.change(screen.getByRole('combobox', { name: 'modelLabel' }), {
      target: { value: 'gemini-3-pro-image' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'extract.run' }))

    expect(mocks.run).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', {
        name: `gemini-3-pro-image:${AI_ADAPTER_TYPES.GEMINI}`,
      }),
    ).toBeInTheDocument()
  })

  it('切到已有对应凭据的 Gemini 后可直接提取', async () => {
    mocks.keys = [makeKey('gemini-3-pro-image', AI_ADAPTER_TYPES.GEMINI)]
    renderExtraction()
    configureOpenAI()
    fireEvent.change(screen.getByRole('combobox', { name: 'modelLabel' }), {
      target: { value: 'gemini-3-pro-image' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'extract.run' }))

    await waitFor(() =>
      expect(mocks.run).toHaveBeenCalledWith(
        expect.objectContaining({
          capability: 'extract-element',
          modelId: 'gemini-3-pro-image',
        }),
      ),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'extract.run' })).toBeEnabled(),
    )
  })

  it('key 名单还没回来：不知道缺不缺，照常提取、⛔ 不弹配置', async () => {
    mocks.keysLoaded = false
    renderExtraction()
    fireEvent.click(screen.getByRole('button', { name: 'extract.run' }))

    await waitFor(() =>
      expect(mocks.run).toHaveBeenCalledWith(
        expect.objectContaining({ capability: 'extract-element' }),
      ),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('同模型但不同 adapter 的已存凭据不能放行 Gemini 提取', () => {
    mocks.keys = [makeKey('gemini-3-pro-image', AI_ADAPTER_TYPES.OPENAI)]
    renderExtraction()
    fireEvent.change(screen.getByRole('combobox', { name: 'modelLabel' }), {
      target: { value: 'gemini-3-pro-image' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'extract.run' }))

    expect(mocks.run).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', {
        name: `gemini-3-pro-image:${AI_ADAPTER_TYPES.GEMINI}`,
      }),
    ).toBeInTheDocument()
  })
})
