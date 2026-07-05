import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AI_MODELS } from '@/constants/models'

import { LoraTrainingForm } from './LoraTrainingDialog'

// P1-2 (Hard Rule 8): the training form's Submit button must never be
// disabled just because the user hasn't configured an API key yet —
// clicking it should open the same QuickSetupDialog as the provider
// buttons, mirroring the generate page's key-gate pattern (see
// LoraWorkbench.test.tsx's "API key gate" suite for the sibling case).

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const base = `${namespace}:${key}`
      if (!values) return base
      const interpolated = Object.entries(values)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(',')
      return `${base}(${interpolated})`
    }
    return t
  },
}))

const mockUseApiKeysContext = vi.hoisted(() => vi.fn())
vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: mockUseApiKeysContext,
}))

const mockSubmit = vi.hoisted(() => vi.fn())
let mockImageUrls: string[] = []
vi.mock('@/hooks/use-lora-training', () => ({
  useLoraTraining: () => ({
    jobs: [],
    isLoading: false,
    isSubmitting: false,
    submit: mockSubmit,
    refresh: vi.fn(),
    activePollingJobId: null,
    uploaded: [],
    failed: [],
    uploadsInFlight: 0,
    uploadImages: vi.fn(),
    retryFailedUpload: vi.fn(),
    removeUploaded: vi.fn(),
    reorderUploaded: vi.fn(),
    setCoverUploaded: vi.fn(),
    clearImages: vi.fn(),
    dismissFailed: vi.fn(),
    adoptExistingUrls: vi.fn(),
    get imageUrls() {
      return mockImageUrls
    },
  }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

const quickSetupSpy = vi.hoisted(() => vi.fn())
vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: (props: {
    open: boolean
    modelId: string
    adapterType: string
  }) => {
    quickSetupSpy(props)
    if (!props.open) return null
    return (
      <div data-testid="quick-setup-dialog">
        {props.adapterType}:{props.modelId}
      </div>
    )
  },
}))

function fillValidForm() {
  fireEvent.change(
    screen.getByPlaceholderText('LoraTraining:namePlaceholder'),
    {
      target: { value: 'My Character' },
    },
  )
  fireEvent.change(
    screen.getByPlaceholderText('LoraTraining:triggerWordPlaceholder'),
    { target: { value: 'sks_character' } },
  )
}

describe('LoraTrainingForm — P1-2 API key gate (Hard Rule 8)', () => {
  beforeEach(() => {
    mockUseApiKeysContext.mockReset()
    mockSubmit.mockReset()
    quickSetupSpy.mockReset()
    mockImageUrls = Array.from(
      { length: 10 },
      (_, i) => `https://example.com/${i}.png`,
    )
  })

  it('keeps Submit enabled (not disabled) when the form is valid but no provider has a key', () => {
    mockUseApiKeysContext.mockReturnValue({ keys: [] })

    render(<LoraTrainingForm />)
    fillValidForm()

    const submitButton = screen.getByRole('button', {
      name: 'LoraTraining:submit',
    })
    expect(submitButton).not.toBeDisabled()
  })

  it('opens QuickSetupDialog for the selected provider on Submit click instead of silently no-op-ing', () => {
    mockUseApiKeysContext.mockReturnValue({ keys: [] })

    render(<LoraTrainingForm />)
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'LoraTraining:submit' }))

    expect(mockSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('quick-setup-dialog')).toHaveTextContent(
      `${AI_ADAPTER_TYPES.REPLICATE}:${AI_MODELS.ILLUSTRIOUS_XL}`,
    )
  })

  it('submits directly once a key exists for the selected provider', async () => {
    mockUseApiKeysContext.mockReturnValue({
      keys: [
        {
          id: 'key-1',
          adapterType: AI_ADAPTER_TYPES.REPLICATE,
          isActive: true,
        },
      ],
    })
    mockSubmit.mockResolvedValue({ job: { id: 'job-1' } })

    render(<LoraTrainingForm />)
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'LoraTraining:submit' }))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    expect(mockSubmit.mock.calls[0]?.[0]).toMatchObject({ apiKeyId: 'key-1' })
    expect(screen.queryByTestId('quick-setup-dialog')).not.toBeInTheDocument()
  })

  it('shows the no-key warning naming the currently selected provider, without pointing at a sidebar', () => {
    mockUseApiKeysContext.mockReturnValue({ keys: [] })

    render(<LoraTrainingForm />)

    expect(
      screen.getByText('LoraTraining:noApiKey(provider=Replicate)'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('LoraTraining:addApiKeyHint(provider=Replicate)'),
    ).toBeInTheDocument()
  })

  it('still disables Submit for real form-validity reasons (e.g. no images), independent of API key state', () => {
    mockUseApiKeysContext.mockReturnValue({
      keys: [
        {
          id: 'key-1',
          adapterType: AI_ADAPTER_TYPES.REPLICATE,
          isActive: true,
        },
      ],
    })
    mockImageUrls = []

    render(<LoraTrainingForm />)
    fillValidForm()

    expect(
      screen.getByRole('button', { name: 'LoraTraining:submit' }),
    ).toBeDisabled()
  })
})

describe('LoraTrainingForm — D7⑥ image counter tone', () => {
  beforeEach(() => {
    mockUseApiKeysContext.mockReset()
    mockUseApiKeysContext.mockReturnValue({ keys: [] })
    quickSetupSpy.mockReset()
  })

  it('renders the 0/max counter in a neutral (muted) tone, not the warning color', () => {
    mockImageUrls = []
    render(<LoraTrainingForm />)

    const counter = screen.getByText(
      'LoraTraining:imageCountWithMax(count=0,max=50)',
    )
    expect(counter.className).toContain('text-muted-foreground')
    expect(counter.className).not.toContain('text-destructive')
  })

  it('renders a below-minimum but non-zero count in the warning color', () => {
    mockImageUrls = ['https://example.com/1.png', 'https://example.com/2.png']
    render(<LoraTrainingForm />)

    const counter = screen.getByText(
      'LoraTraining:imageCountWithMax(count=2,max=50)',
    )
    expect(counter.className).toContain('text-destructive')
  })
})
