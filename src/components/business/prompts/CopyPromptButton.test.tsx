import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyPromptButton } from './CopyPromptButton'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
afterEach(() => vi.unstubAllGlobals())

describe('CopyPromptButton', () => {
  it('provides selectable text when clipboard access fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<CopyPromptButton prompt="A reusable prompt" />)
    fireEvent.click(screen.getByRole('button', { name: 'copyPrompt' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'manualCopyDescription',
    )
    expect(screen.getByRole('textbox')).toHaveValue('A reusable prompt')
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
  })
  it('shows success after copying the exact prompt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CopyPromptButton prompt="A reusable prompt" />)
    fireEvent.click(screen.getByRole('button', { name: 'copyPrompt' }))
    expect(
      await screen.findByRole('button', { name: 'promptCopied' }),
    ).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('A reusable prompt')
  })
})
