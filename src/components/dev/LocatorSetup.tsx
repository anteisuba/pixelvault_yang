'use client'

import { useEffect } from 'react'

export function LocatorSetup() {
  useEffect(() => {
    void import('@locator/runtime').then((mod) => mod.default())
  }, [])
  return null
}
