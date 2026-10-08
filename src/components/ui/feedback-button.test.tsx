import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FEEDBACK_TIMING } from '@/constants/motion'

import {
  ConfirmDeleteButton,
  FeedbackButton,
  useButtonFeedback,
} from './feedback-button'

function DownloadKey() {
  const { feedback, show } = useButtonFeedback()
  return (
    <FeedbackButton
      feedback={feedback}
      aria-label="Download"
      onClick={() => show({ label: 'Download started' })}
    >
      <svg aria-hidden />
    </FeedbackButton>
  )
}

describe('FeedbackButton', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('turns into the result on the key itself, then shrinks back after 1.6s', () => {
    render(<DownloadKey />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    const key = screen.getByRole('button', { name: 'Download started' })
    expect(key).toHaveAttribute('data-feedback', 'done')
    expect(key).toHaveTextContent('Download started')
    // 结果也说给读屏听。
    expect(screen.getByRole('status')).toHaveTextContent('Download started')

    act(() => {
      vi.advanceTimersByTime(FEEDBACK_TIMING.buttonAckMs)
    })
    const idle = screen.getByRole('button', { name: 'Download' })
    expect(idle).not.toHaveAttribute('data-feedback')
  })

  it('keeps a progress result until it is replaced', () => {
    function UploadKey() {
      const { feedback, show } = useButtonFeedback()
      return (
        <FeedbackButton
          feedback={feedback}
          onClick={() =>
            show({ label: 'Uploading 1/3', tone: 'progress', icon: null })
          }
        >
          Upload
        </FeedbackButton>
      )
    }
    render(<UploadKey />)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    act(() => {
      vi.advanceTimersByTime(FEEDBACK_TIMING.buttonAckMs * 3)
    })
    expect(
      screen.getByRole('button', { name: 'Uploading 1/3' }),
    ).toHaveAttribute('data-feedback', 'progress')
  })
})

describe('ConfirmDeleteButton', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function renderKey(onConfirm = vi.fn()) {
    render(
      <div>
        <ConfirmDeleteButton
          aria-label="Delete"
          confirmLabel="Confirm delete"
          onConfirm={onConfirm}
        >
          Delete
        </ConfirmDeleteButton>
        <p>elsewhere</p>
      </div>,
    )
    return onConfirm
  }

  it('first press stretches into a red confirm; only the second press deletes', () => {
    const onConfirm = renderKey()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const armed = screen.getByRole('button', { name: 'Confirm delete' })
    expect(armed).toHaveAttribute('data-feedback', 'danger')
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(armed)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('shrinks back after 3 seconds without deleting', () => {
    const onConfirm = renderKey()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    act(() => {
      vi.advanceTimersByTime(FEEDBACK_TIMING.deleteArmMs)
    })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shrinks back when pressing anywhere else or Escape', () => {
    renderKey()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.pointerDown(screen.getByText('elsewhere'))
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})
