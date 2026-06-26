'use client'

import { useEffect } from 'react'

import { useKeyboardInset } from '@/hooks/use-keyboard-inset'

export function KeyboardInsetBridge() {
  const keyboardInset = useKeyboardInset()

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--keyboard-inset', `${keyboardInset}px`)
    root.dataset.keyboardOpen = keyboardInset > 0 ? 'true' : 'false'

    return () => {
      root.style.removeProperty('--keyboard-inset')
      root.dataset.keyboardOpen = 'false'
    }
  }, [keyboardInset])

  return null
}
