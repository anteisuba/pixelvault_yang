import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ROUTES } from '@/constants/routes'

import { QuickSetupDialog } from './QuickSetupDialog'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  createApiKey: vi.fn(),
  refresh: vi.fn(),
  verify: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  createApiKey: mocks.createApiKey,
  deleteApiKey: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({ refresh: mocks.refresh, verify: mocks.verify }),
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioFormOptional: () => ({ dispatch: mocks.dispatch }),
}))

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <QuickSetupDialog
      open
      onOpenChange={onOpenChange}
      modelId="fal-ai/flux-2-pro"
      modelLabel="fal.ai"
      adapterType={AI_ADAPTER_TYPES.FAL}
      optionId="workspace:fal-ai/flux-2-pro"
    />,
  )
  return onOpenChange
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createApiKey.mockResolvedValue({
    success: true,
    data: { id: 'edit-key' },
  })
  mocks.verify.mockResolvedValue('available')
})

describe('QuickSetupDialog', () => {
  it('configures an edit key without replacing the generation model selection', async () => {
    const onVerified = vi.fn()
    render(
      <QuickSetupDialog
        open
        onOpenChange={vi.fn()}
        modelId="ideogram-4.5"
        modelLabel="Ideogram 4.5"
        adapterType={AI_ADAPTER_TYPES.IDEOGRAM}
        optionId="edit:ideogram-4.5"
        selectStudioModel={false}
        onVerified={onVerified}
      />,
    )
    fireEvent.change(screen.getByLabelText('QuickSetup:step2'), {
      target: { value: 'test-edit-key-value' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'QuickSetup:verify' }))
    await waitFor(() =>
      expect(onVerified).toHaveBeenCalledWith('ideogram-4.5', 'edit-key'),
    )
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('links to the key manager from the footer', () => {
    renderDialog()
    const link = screen.getByText('QuickSetup:manageAllKeys')
    expect(link.getAttribute('href')).toBe(ROUTES.SETTINGS_KEYS)
  })

  it('closes itself when the footer link is followed', () => {
    const onOpenChange = renderDialog()
    fireEvent.click(screen.getByText('QuickSetup:manageAllKeys'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
