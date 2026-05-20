import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  useTrainingSubmitGate,
  type TrainingSubmitGateInput,
} from './use-training-submit-gate'

const VALID: TrainingSubmitGateInput = {
  name: 'My Character',
  triggerWord: 'sks_character',
  baseModel: 'flux-1-d',
  imageCount: 10,
  uploadsInFlight: 0,
  hasApiKey: true,
}

function render(overrides: Partial<TrainingSubmitGateInput> = {}) {
  return renderHook(() => useTrainingSubmitGate({ ...VALID, ...overrides }))
}

describe('useTrainingSubmitGate', () => {
  it('returns ready when all gates pass', () => {
    const { result } = render()
    expect(result.current.disabled).toBe(false)
    expect(result.current.reasonKey).toBeNull()
    expect(result.current.badge).toBe('ready')
  })

  it('blocks with noImages when image count is 0', () => {
    const { result } = render({ imageCount: 0 })
    expect(result.current.disabled).toBe(true)
    expect(result.current.reasonKey).toBe('noImages')
    expect(result.current.badge).toBe('incomplete')
  })

  it('blocks with tooFewImages when below MIN_IMAGES', () => {
    const { result } = render({ imageCount: 3 })
    expect(result.current.disabled).toBe(true)
    expect(result.current.reasonKey).toBe('tooFewImages')
    expect(result.current.badge).toBe('incomplete')
  })

  it('blocks with noName when name is empty/whitespace', () => {
    const { result } = render({ name: '   ' })
    expect(result.current.reasonKey).toBe('noName')
    expect(result.current.badge).toBe('incomplete')
  })

  it('blocks with invalidName when name contains forbidden chars', () => {
    const { result } = render({ name: 'My/Bad:Name' })
    expect(result.current.disabled).toBe(true)
    expect(result.current.reasonKey).toBe('invalidName')
    expect(result.current.badge).toBe('invalid')
  })

  it('blocks with noTrigger when trigger word is empty', () => {
    const { result } = render({ triggerWord: '' })
    expect(result.current.reasonKey).toBe('noTrigger')
    expect(result.current.badge).toBe('incomplete')
  })

  it('blocks with invalidTrigger when trigger word has invalid chars', () => {
    const { result } = render({ triggerWord: 'has space!' })
    expect(result.current.disabled).toBe(true)
    expect(result.current.reasonKey).toBe('invalidTrigger')
    expect(result.current.badge).toBe('invalid')
  })

  it('blocks with unsupportedBaseModel for non-flux base models', () => {
    const { result } = render({ baseModel: 'sdxl-1.0' })
    expect(result.current.disabled).toBe(true)
    expect(result.current.reasonKey).toBe('unsupportedBaseModel')
    expect(result.current.badge).toBe('invalid')
  })

  it('blocks with noApiKey when no provider key configured', () => {
    const { result } = render({ hasApiKey: false })
    expect(result.current.reasonKey).toBe('noApiKey')
    expect(result.current.badge).toBe('incomplete')
  })

  it('blocks with uploading while uploads in flight', () => {
    const { result } = render({ uploadsInFlight: 2 })
    expect(result.current.disabled).toBe(true)
    expect(result.current.reasonKey).toBe('uploading')
  })

  it('prefers hard validation over incomplete gates', () => {
    // invalidName beats noImages — user typed something wrong vs just empty
    const { result } = render({ name: 'bad/name', imageCount: 0 })
    expect(result.current.reasonKey).toBe('invalidName')
  })
})
