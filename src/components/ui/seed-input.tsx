'use client'

import { Dice5 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface SeedInputProps {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  randomLabel: string
  disabled?: boolean
  /** Hint text displayed below the label */
  hint?: string
}

/**
 * Seed input with random button.
 * Value of -1 or undefined means "random" (server picks).
 */
export function SeedInput({
  label,
  value,
  onChange,
  randomLabel,
  disabled = false,
  hint,
}: SeedInputProps) {
  const isRandom = value === undefined || value === -1

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={4294967295}
          value={isRandom ? '' : value}
          placeholder={randomLabel}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') {
              onChange(undefined)
            } else {
              const num = parseInt(v, 10)
              if (!isNaN(num) && num >= 0) onChange(num)
            }
          }}
          disabled={disabled}
          className="h-9 font-mono"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.floor(Math.random() * 4294967295))}
          disabled={disabled}
          className="h-9 shrink-0 px-3"
        >
          <Dice5 className="size-4" />
        </Button>
      </div>
    </div>
  )
}
