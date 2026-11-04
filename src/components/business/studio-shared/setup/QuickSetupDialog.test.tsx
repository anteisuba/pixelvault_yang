import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ROUTES } from '@/constants/routes'
import { message as M } from '@/test/app-harness'
import { fakeStudioServer, renderWithStudio } from '@/test/studio-harness'

import { QuickSetupDialog } from './QuickSetupDialog'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

const ok = (data: unknown) => Response.json({ success: true, data })

let server: ReturnType<typeof fakeStudioServer>
beforeEach(() => {
  // 只假网络：存 key → 回新 id；验证 → 可用。
  server = fakeStudioServer()
    .on('POST', API_ENDPOINTS.API_KEYS, () =>
      ok({
        id: 'edit-key',
        adapterType: AI_ADAPTER_TYPES.IDEOGRAM,
        label: 'Ideogram 4.5',
        maskedKey: '••••',
        isActive: true,
        createdAt: new Date().toISOString(),
      }),
    )
    .on(
      'POST',
      `${API_ENDPOINTS.API_KEYS}/:id/verify`,
      (_request, { params }) =>
        params.then(({ id }) => ok({ id, status: 'available' })),
    )
})
afterEach(() => vi.unstubAllGlobals())

function renderDialog(onOpenChange = vi.fn()) {
  renderWithStudio(
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

describe('QuickSetupDialog', () => {
  it('configures an edit key without replacing the generation model selection', async () => {
    const onVerified = vi.fn()
    const { studio } = renderWithStudio(
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
    const selectedBefore = studio.current.state.selectedOptionId

    fireEvent.change(screen.getByLabelText(M('QuickSetup.step2')), {
      target: { value: 'test-edit-key-value' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: M('QuickSetup.verify') }),
    )

    await waitFor(() =>
      expect(onVerified).toHaveBeenCalledWith('ideogram-4.5', 'edit-key'),
    )
    // key 真存过、真验过；工作台里选中的生成模型没被换成这把 key。
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: `${API_ENDPOINTS.API_KEYS}/edit-key/verify`,
    })
    expect(studio.current.state.selectedOptionId).toBe(selectedBefore)
    expect(studio.current.state.selectedOptionId).not.toBe('key:edit-key')
  })

  it('links to the key manager from the footer', () => {
    renderDialog()
    const link = screen.getByText(M('QuickSetup.manageAllKeys'))
    expect(link.getAttribute('href')).toBe(ROUTES.SETTINGS_KEYS)
  })

  it('closes itself when the footer link is followed', () => {
    const onOpenChange = renderDialog()
    fireEvent.click(screen.getByText(M('QuickSetup.manageAllKeys')))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
