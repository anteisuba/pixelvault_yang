import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './copy-button'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
afterEach(() => vi.unstubAllGlobals())

describe('CopyButton', () => {
  it('provides selectable text when clipboard access fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<CopyButton text="A reusable prompt" />)
    fireEvent.click(screen.getByRole('button', { name: 'copy' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'manualCopyDescription',
    )
    expect(screen.getByRole('textbox')).toHaveValue('A reusable prompt')
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
  })
  it('swaps the icon to a check after copying the exact text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CopyButton text="A reusable prompt" />)
    fireEvent.click(screen.getByRole('button', { name: 'copy' }))
    expect(
      await screen.findByRole('button', { name: 'copied' }),
    ).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('A reusable prompt')
  })
})
