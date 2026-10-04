import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

import { ImageEditSurface } from './ImageEditSurface'

const mocks = vi.hoisted(() => ({
  keys: [] as UserApiKeyRecord[],
  healthMap: {} as Record<string, ApiKeyHealthStatus>,
  run: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({
    keys: mocks.keys,
    healthMap: mocks.healthMap,
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
    ModelPickerPopover: () => null,
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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keys = []
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
