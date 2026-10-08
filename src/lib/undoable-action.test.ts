import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}))

import { FEEDBACK_TIMING } from '@/constants/motion'

import {
  resetUndoableActionsForTest,
  runUndoableAction,
} from './undoable-action'

interface UndoAction {
  label: string
  onClick: () => void
}

function lastUndoAction(): UndoAction {
  const options = toastSuccess.mock.calls.at(-1)?.[1] as {
    action: UndoAction
  }
  return options.action
}

describe('runUndoableAction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    toastSuccess.mockClear()
  })
  afterEach(() => {
    resetUndoableActionsForTest()
    vi.useRealTimers()
  })

  it('applies at once, shows the bar with Undo, and commits only after the window', () => {
    const apply = vi.fn()
    const commit = vi.fn()
    runUndoableAction({
      message: 'Deleted',
      undoLabel: 'Undo',
      apply,
      undo: vi.fn(),
      commit,
    })

    expect(apply).toHaveBeenCalledTimes(1)
    expect(toastSuccess).toHaveBeenCalledWith(
      'Deleted',
      expect.objectContaining({ duration: FEEDBACK_TIMING.undoWindowMs }),
    )
    expect(lastUndoAction().label).toBe('Undo')
    expect(commit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(FEEDBACK_TIMING.undoWindowMs)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('Undo puts it back and the server is never touched', () => {
    const undo = vi.fn()
    const commit = vi.fn()
    runUndoableAction({
      message: 'Deleted',
      undoLabel: 'Undo',
      apply: vi.fn(),
      undo,
      commit,
    })

    lastUndoAction().onClick()
    vi.advanceTimersByTime(FEEDBACK_TIMING.undoWindowMs * 2)
    expect(undo).toHaveBeenCalledTimes(1)
    expect(commit).not.toHaveBeenCalled()
  })

  it('Undo after the commit already ran does nothing', () => {
    const undo = vi.fn()
    runUndoableAction({
      message: 'Deleted',
      undoLabel: 'Undo',
      apply: vi.fn(),
      undo,
      commit: vi.fn(),
    })
    vi.advanceTimersByTime(FEEDBACK_TIMING.undoWindowMs)
    lastUndoAction().onClick()
    expect(undo).not.toHaveBeenCalled()
  })

  it('commits everything still pending when the page goes away', () => {
    const commit = vi.fn()
    runUndoableAction({
      message: 'Deleted',
      undoLabel: 'Undo',
      apply: vi.fn(),
      undo: vi.fn(),
      commit,
    })
    window.dispatchEvent(new Event('pagehide'))
    expect(commit).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(FEEDBACK_TIMING.undoWindowMs)
    expect(commit).toHaveBeenCalledTimes(1)
  })
})
