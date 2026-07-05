import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImageAttachmentPreviewStrip } from './ImageAttachmentPreviewStrip'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('ImageAttachmentPreviewStrip', () => {
  it('opens the selected attachment in a keyboard-dismissible preview', async () => {
    render(
      <ImageAttachmentPreviewStrip
        entries={[
          {
            url: 'https://example.com/reference.png',
            disabledReason: null,
          },
        ]}
        previewAlt="Reference image"
        previewLabel={(index) => `Preview reference image ${index}`}
        previewDescription="Expanded reference image"
        previewCloseLabel="Close image preview"
        removeLabel={(index) => `Remove reference image ${index}`}
        onRemove={vi.fn()}
        variant="composer"
      />,
    )

    const trigger = screen.getByRole('button', {
      name: 'Preview reference image 1',
    })

    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('img', {
        name: 'Preview reference image 1',
      }),
    ).toHaveAttribute('src', 'https://example.com/reference.png')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })
  })
})
