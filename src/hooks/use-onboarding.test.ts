import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ONBOARDING_STORAGE_KEY } from '@/constants/onboarding'

import { useOnboarding } from './use-onboarding'

describe('useOnboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts at welcome then advances to prompt and model', () => {
    const { result } = renderHook(() => useOnboarding())

    expect(result.current.active).toBe(true)
    expect(result.current.currentStep).toBe('welcome')

    act(() => result.current.next())
    expect(result.current.currentStep).toBe('prompt')

    act(() => result.current.next())
    expect(result.current.currentStep).toBe('model')
  })

  it('marks only apiKey as skippable', () => {
    const { result } = renderHook(() => useOnboarding())

    expect(result.current.currentStep).toBe('welcome')
    expect(result.current.isSkippable).toBe(false)

    act(() => result.current.next())
    expect(result.current.currentStep).toBe('prompt')
    expect(result.current.isSkippable).toBe(false)

    act(() => result.current.next())
    expect(result.current.currentStep).toBe('model')
    expect(result.current.isSkippable).toBe(false)

    act(() => result.current.next())
    expect(result.current.currentStep).toBe('apiKey')
    expect(result.current.isSkippable).toBe(true)

    act(() => result.current.next())
    expect(result.current.currentStep).toBe('generate')
    expect(result.current.isSkippable).toBe(false)
  })

  it('completes onboarding and persists the storage key after next on the last step', () => {
    const { result } = renderHook(() => useOnboarding())

    while (!result.current.isLastStep) {
      act(() => result.current.next())
    }

    expect(result.current.currentStep).toBe('generate')
    expect(result.current.active).toBe(true)

    act(() => result.current.next())

    expect(result.current.active).toBe(false)
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true')
  })
})
