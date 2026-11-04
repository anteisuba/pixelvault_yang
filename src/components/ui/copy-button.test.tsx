import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { message, renderWithApp } from '@/test/app-harness'
import { DESKTOP_WIDTH, setViewportWidth } from '@/test/viewport'
import { CopyButton } from './copy-button'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

beforeEach(() => setViewportWidth(DESKTOP_WIDTH))
afterEach(() => vi.unstubAllGlobals())

describe('CopyButton', () => {
  it('provides selectable text when clipboard access fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    renderWithApp(<CopyButton text="A reusable prompt" />)
    fireEvent.click(
      screen.getByRole('button', { name: message('Common.copy') }),
    )
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      message('Common.manualCopyDescription'),
    )
    expect(screen.getByRole('textbox')).toHaveValue('A reusable prompt')
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
  })
  it('swaps the icon to a check after copying the exact text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    renderWithApp(<CopyButton text="A reusable prompt" />)
    fireEvent.click(
      screen.getByRole('button', { name: message('Common.copy') }),
    )
    expect(
      await screen.findByRole('button', { name: message('Common.copied') }),
    ).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('A reusable prompt')
  })
})
