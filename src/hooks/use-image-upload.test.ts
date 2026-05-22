import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useImageUpload } from '@/hooks/use-image-upload'

describe('useImageUpload', () => {
  describe('initial state', () => {
    it('starts empty', () => {
      const { result } = renderHook(() => useImageUpload())
      expect(result.current.referenceImages).toEqual([])
      expect(result.current.referenceEntries).toEqual([])
      expect(result.current.referenceImage).toBeUndefined()
    })

    it('treats unconfigured cap as unlimited so the first add lands enabled', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => {
        result.current.addReferenceImage('a.png')
      })
      expect(result.current.referenceImages).toEqual(['a.png'])
      expect(result.current.referenceEntries[0]?.disabledReason).toBeNull()
    })
  })

  describe('add + remove (multi-image mode)', () => {
    it('appends entries up to the configured max', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(3))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      act(() => result.current.addReferenceImage('c'))
      expect(result.current.referenceImages).toEqual(['a', 'b', 'c'])
    })

    it('keeps extra adds disabled once the enabled count hits max', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(2))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      act(() => result.current.addReferenceImage('c'))
      expect(result.current.referenceImages).toEqual(['a', 'b'])
      expect(result.current.referenceEntries).toHaveLength(3)
      expect(result.current.referenceEntries[2]?.disabledReason).toBe(
        'over_limit',
      )
    })

    it('removeReferenceImage uses the entries index and shifts disabled flags', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(4))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      act(() => result.current.addReferenceImage('c'))
      // Tighten cap so c becomes over_limit
      act(() => result.current.setMaxImages(2))
      expect(result.current.referenceImages).toEqual(['a', 'b'])
      // Remove b → c should graduate to enabled
      act(() => result.current.removeReferenceImage(1))
      expect(result.current.referenceImages).toEqual(['a', 'c'])
      expect(result.current.referenceEntries.map((e) => e.url)).toEqual([
        'a',
        'c',
      ])
    })
  })

  describe('single-image mode (max=1)', () => {
    it('replaces the existing entry on each add', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(1))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      expect(result.current.referenceImages).toEqual(['b'])
      expect(result.current.referenceEntries).toHaveLength(1)
    })
  })

  describe('preservation on model switch', () => {
    it('preserves over-limit entries when narrowing the cap', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(4))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      act(() => result.current.addReferenceImage('c'))
      act(() => result.current.addReferenceImage('d'))
      // Switch to a model that only accepts 2
      act(() => result.current.setMaxImages(2))
      // referenceImages drops to the enabled prefix
      expect(result.current.referenceImages).toEqual(['a', 'b'])
      // ...but the full state stays, with c/d flagged
      expect(
        result.current.referenceEntries.map((e) => e.disabledReason),
      ).toEqual([null, null, 'over_limit', 'over_limit'])
    })

    it('restores entries when the cap widens again', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(4))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      act(() => result.current.addReferenceImage('c'))
      act(() => result.current.setMaxImages(2))
      // Switch back to a higher-capacity model
      act(() => result.current.setMaxImages(4))
      expect(result.current.referenceImages).toEqual(['a', 'b', 'c'])
      expect(
        result.current.referenceEntries.every((e) => e.disabledReason === null),
      ).toBe(true)
    })

    it('flips all entries to unsupported when the model accepts none', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(4))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      act(() => result.current.setMaxImages(0))
      expect(result.current.referenceImages).toEqual([])
      expect(
        result.current.referenceEntries.every(
          (e) => e.disabledReason === 'unsupported',
        ),
      ).toBe(true)
    })

    it('keeps new adds unsupported while in unsupported mode', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(0))
      act(() => result.current.addReferenceImage('a'))
      expect(result.current.referenceImages).toEqual([])
      expect(result.current.referenceEntries).toHaveLength(1)
      expect(result.current.referenceEntries[0]?.disabledReason).toBe(
        'unsupported',
      )

      act(() => result.current.setMaxImages(1))
      expect(result.current.referenceImages).toEqual(['a'])
    })

    it('does not churn state when setMaxImages is a no-op', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(4))
      act(() => result.current.addReferenceImage('a'))
      const before = result.current.referenceEntries
      act(() => result.current.setMaxImages(4))
      // Same array reference proves we short-circuited.
      expect(result.current.referenceEntries).toBe(before)
    })
  })

  describe('legacy helpers', () => {
    it('setReferenceImage replaces the list with a single entry', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(4))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      act(() => result.current.setReferenceImage('c'))
      expect(result.current.referenceImages).toEqual(['c'])
    })

    it('setReferenceImage(undefined) clears all', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.setReferenceImage(undefined))
      expect(result.current.referenceEntries).toEqual([])
    })

    it('clearAllImages empties the entries', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(4))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      act(() => result.current.clearAllImages())
      expect(result.current.referenceEntries).toEqual([])
    })

    it('addFromUrl is just addReferenceImage', async () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(4))
      await act(async () => {
        await result.current.addFromUrl('https://cdn.example.com/x.jpg')
      })
      expect(result.current.referenceImages).toEqual([
        'https://cdn.example.com/x.jpg',
      ])
    })
  })

  describe('referenceImage (back-compat single getter)', () => {
    it('returns the first enabled entry', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(3))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      expect(result.current.referenceImage).toBe('a')
    })

    it('skips over disabled entries when picking the first', () => {
      const { result } = renderHook(() => useImageUpload())
      act(() => result.current.setMaxImages(2))
      act(() => result.current.addReferenceImage('a'))
      act(() => result.current.addReferenceImage('b'))
      // Tighten to 0 → both become unsupported
      act(() => result.current.setMaxImages(0))
      expect(result.current.referenceImage).toBeUndefined()
    })
  })
})
