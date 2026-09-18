import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ROUTES } from '@/constants/routes'

import { QuickSetupDialog } from './QuickSetupDialog'

// D3 ④ 决策 6：面 1 唯一的改动是底部那一行「管理全部 key →」。
// 弹层本体（三步录入）不动，所以这里只钉那一行。

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({ refresh: vi.fn(), verify: vi.fn() }),
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioFormOptional: () => null,
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

describe('QuickSetupDialog', () => {
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
