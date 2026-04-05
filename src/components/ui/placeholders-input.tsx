'use client'

import { useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'

interface PlaceholdersInputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'onChange'> {
  placeholders: string[]
  value: string
  onChange: (value: string) => void
  intervalMs?: number
}

export function PlaceholdersInput({
  placeholders,
  value,
  onChange,
  intervalMs = 3000,
  className,
  ...props
}: PlaceholdersInputProps) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (value) return // Don't cycle when user is typing
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length)
    }, intervalMs)
    return () => clearInterval(interval)
  }, [placeholders.length, intervalMs, value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value)
    },
    [onChange],
  )

  return (
    <div className={cn('relative flex-1', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        className="h-9 w-full rounded-full border border-border/70 bg-card/60 pl-10 pr-4 text-sm text-foreground outline-none transition-[color,box-shadow] placeholder:text-transparent focus:ring-[3px] focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      {/* Animated placeholder */}
      {!value && (
        <div className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.span
              key={placeholderIndex}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 0.5 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="block text-sm text-muted-foreground whitespace-nowrap"
            >
              {placeholders[placeholderIndex]}
            </motion.span>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
