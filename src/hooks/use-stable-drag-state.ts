'use client'

import { useCallback, useRef, useState, type DragEvent } from 'react'

interface UseStableDragStateReturn {
  isDragging: boolean
  setDragging: (nextActive: boolean) => void
  resetDragging: () => void
  handleDragEnter: (event: DragEvent<Element>) => void
  handleDragOver: (event: DragEvent<Element>) => void
  handleDragLeave: (event: DragEvent<Element>) => void
}

export function useStableDragState(): UseStableDragStateReturn {
  const [isDragging, setIsDragging] = useState(false)
  const dragActiveRef = useRef(false)
  const dragDepthRef = useRef(0)

  const setDragging = useCallback((nextActive: boolean) => {
    if (dragActiveRef.current === nextActive) return
    dragActiveRef.current = nextActive
    setIsDragging(nextActive)
  }, [])

  const resetDragging = useCallback(() => {
    dragDepthRef.current = 0
    setDragging(false)
  }, [setDragging])

  const handleDragEnter = useCallback(
    (event: DragEvent<Element>) => {
      event.preventDefault()
      dragDepthRef.current += 1
      setDragging(true)
    },
    [setDragging],
  )

  const handleDragOver = useCallback(
    (event: DragEvent<Element>) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setDragging(true)
    },
    [setDragging],
  )

  const handleDragLeave = useCallback(
    (event: DragEvent<Element>) => {
      event.preventDefault()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) setDragging(false)
    },
    [setDragging],
  )

  return {
    isDragging,
    setDragging,
    resetDragging,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
  }
}
