import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { Studio3DWorkspace } from './Studio3DWorkspace'

const mocks = vi.hoisted(() => ({
  mobile: false,
  hasKey: true,
  error: null as string | null,
  generate: vi.fn(),
  reset: vi.fn(),
  restore: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.mobile }))
vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({
    keys: mocks.hasKey
      ? [
          {
            id: 'key',
            adapterType: AI_ADAPTER_TYPES.HYPER3D_RODIN,
            isActive: true,
          },
        ]
      : [],
    isLoading: false,
  }),
}))
vi.mock('@/hooks/use-generate-3d', () => ({
  useGenerate3D: () => ({
    isGenerating: false,
    stage: 'idle',
    elapsedSeconds: 0,
    error: mocks.error,
    generate: mocks.generate,
    reset: mocks.reset,
  }),
}))
vi.mock('@/hooks/use-generate-multiview', () => ({
  useGenerateMultiView: () => ({
    isGenerating: false,
    views: [],
    generate: vi.fn(),
    restore: mocks.restore,
    reset: mocks.reset,
  }),
}))
vi.mock('@/components/business/ModelViewer', () => ({
  ModelViewer: () => null,
}))
vi.mock('@/components/business/WireframeModelPreview', () => ({
  WireframeModelPreview: () => null,
}))
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))
vi.mock('@/components/business/studio-shared/pickers', () => ({
  MainModelPicker: () => null,
}))
vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: ({ open }: { open: boolean }) =>
    open ? <div>setup-dialog</div> : null,
}))
vi.mock('@/components/ui/responsive-dialog', () => ({
  ResponsiveDialog: ({
    open,
    children,
  }: {
    open: boolean
    children: ReactNode
  }) => (open ? <div role="dialog">{children}</div> : null),
  ResponsiveDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  ),
  ResponsiveDialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}))

beforeEach(() => {
  mocks.mobile = false
  mocks.hasKey = true
  mocks.error = null
  vi.clearAllMocks()
})
const mount = () =>
  render(
    <Studio3DWorkspace
      initialGenerations={[]}
      initialTotal={0}
      initialHasMore={false}
    />,
  )

describe('Studio3DWorkspace approved layout', () => {
  it('keeps format accessible while geometry controls are inside advanced settings', () => {
    mount()
    const advanced = screen
      .getByText('rodinAdvancedSectionLabel')
      .closest('details')
    expect(advanced).not.toHaveAttribute('open')
    expect(advanced?.querySelector('#rodin-tapose')).not.toBeNull()
    expect(
      document.getElementById('rodin-format')?.closest('details'),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'selectImageToGenerate' }),
    ).toBeDisabled()
  })
  it('retains the text draft when switching input modes without submitting', () => {
    mount()
    fireEvent.change(screen.getByRole('combobox', { name: 'rodinModeLabel' }), {
      target: { value: 'text' },
    })
    fireEvent.change(screen.getByLabelText(/rodinPromptLabel/), {
      target: { value: 'A ceramic vase' },
    })
    expect(screen.getByRole('button', { name: 'generateButton' })).toBeEnabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'rodinModeLabel' }), {
      target: { value: 'image' },
    })
    expect(
      screen.getByRole('button', { name: 'selectImageToGenerate' }),
    ).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'rodinModeLabel' }), {
      target: { value: 'text' },
    })
    expect(screen.getByLabelText(/rodinPromptLabel/)).toHaveValue(
      'A ceramic vase',
    )
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('offers inline setup instead of a disabled missing-key action', () => {
    mocks.hasKey = false
    mount()
    const buttons = screen.getAllByRole('button', { name: 'setupApiKeyButton' })
    fireEvent.click(buttons[buttons.length - 1])
    expect(screen.getByText('setup-dialog')).toBeInTheDocument()
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('opens settings in the narrow-screen dialog', () => {
    mocks.mobile = true
    mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'settingsTitle' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('rodinModeLabel')).toBeInTheDocument()
  })
  it('shows real error details and retained-draft feedback', () => {
    mocks.error = 'Provider timed out'
    mount()
    expect(screen.getByRole('alert')).toHaveTextContent('Provider timed out')
    expect(screen.getByRole('alert')).toHaveTextContent('draftPreserved')
  })
})
