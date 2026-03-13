'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { API_ENDPOINTS } from '@/constants/config'

interface UseCreditsReturn {
  credits: number
  isLoading: boolean
}

export function useCredits(): UseCreditsReturn {
  const { isSignedIn } = useUser()
  const [credits, setCredits] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let isCancelled = false

    async function loadCredits() {
      if (!isSignedIn) {
        if (!isCancelled) {
          setCredits(0)
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)

      try {
        const response = await fetch(API_ENDPOINTS.CREDITS)
        const data: { credits: number } = await response.json()

        if (!isCancelled) {
          setCredits(data.credits ?? 0)
        }
      } catch {
        if (!isCancelled) {
          setCredits(0)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadCredits()

    return () => {
      isCancelled = true
    }
  }, [isSignedIn])

  return { credits, isLoading }
}
