import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { PromptTemplateDetailDialog } from './PromptTemplateDetailDialog'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api-client/recipes', () => ({
  getRecipeAPI: mocks.get,
  updateRecipeAPI: mocks.update,
  listRecipeGenerationsAPI: vi
    .fn()
    .mockResolvedValue({ success: true, data: [] }),
  deleteRecipeAPI: vi.fn(),
  setRecipeVisibilityAPI: vi.fn(),
}))

const recipe = {
  id: 'one',
  name: 'Saved name',
  compiledPrompt: 'Saved prompt',
  modelId: 'flux-2-pro',
  outputType: 'IMAGE' as const,
  outputTypeLabel: 'Image',
  version: 1,
  createdAt: '2026-09-09T00:00:00Z',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue({
    success: true,
    data: {
      ...recipe,
      provider: 'Saved provider',
      negativePrompt: 'Saved negative',
      parentGenerationId: null,
    },
  })
})
function show(initialMode: 'edit' | 'use' | 'view' = 'edit') {
  return render(
    <PromptTemplateDetailDialog
      recipe={recipe}
      locale="en"
      open
      onOpenChange={vi.fn()}
      onDeleted={vi.fn()}
      initialMode={initialMode}
    />,
  )
}

it('restores saved fields after cancelling edits', async () => {
  show()
  await screen.findByDisplayValue('Saved provider')
  for (const [label, value] of [
    ['createNameLabel', 'New name'],
    ['createPromptLabel', 'New prompt'],
    ['provider', 'New provider'],
    ['createNegativePromptLabel', 'New negative'],
  ]) {
    fireEvent.change(screen.getByRole('textbox', { name: label }), {
      target: { value },
    })
  }
  fireEvent.click(screen.getByRole('button', { name: 'editCancel' }))
  expect(screen.getByText('Saved prompt')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'editAction' }))
  for (const value of [
    'Saved name',
    'Saved prompt',
    'Saved provider',
    'Saved negative',
  ]) {
    expect(screen.getByDisplayValue(value)).toBeInTheDocument()
  }
  expect(mocks.update).not.toHaveBeenCalled()
})

it('keeps the draft after a failed save and updates the saved baseline on retry', async () => {
  mocks.update
    .mockResolvedValueOnce({ success: false, error: 'Save unavailable' })
    .mockResolvedValueOnce({ success: true, data: { version: 2 } })
  show()
  await screen.findByDisplayValue('Saved provider')
  fireEvent.change(screen.getByRole('textbox', { name: 'createPromptLabel' }), {
    target: { value: 'New prompt' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'editSubmit' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable')
  expect(screen.getByDisplayValue('New prompt')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'editSubmit' }))
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'editAction' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'createPromptLabel' }), {
    target: { value: 'Another draft' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'editReset' }))
  expect(screen.getByDisplayValue('New prompt')).toBeInTheDocument()
})

it('requires confirmation before applying a template to Studio', async () => {
  show('use')
  await screen.findByRole('button', { name: 'useConfirmAction' })
  expect(mocks.push).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'editCancel' }))
  expect(mocks.push).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'useInStudio' }))
  fireEvent.click(screen.getByRole('button', { name: 'useConfirmAction' }))
  expect(mocks.push).toHaveBeenCalledWith('/studio/image')
})

it('offers retry when detail loading fails', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Offline'))
  show()
  expect(await screen.findByRole('alert')).toHaveTextContent('detailLoadFailed')
  fireEvent.click(screen.getByRole('button', { name: 'retryAction' }))
  expect(await screen.findByDisplayValue('Saved provider')).toBeInTheDocument()
})
