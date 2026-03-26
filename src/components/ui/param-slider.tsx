'use client'

import { Slider } from '@/components/ui/slider'

interface ParamSliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  disabled?: boolean
  /** Hint text displayed below the label */
  hint?: string
  /** Format the displayed value (e.g. add suffix) */
  formatValue?: (value: number) => string
}

/**
 * Labeled slider for numeric generation parameters.
 * Reused across generation forms for guidance scale, steps, strength, etc.
 */
export function ParamSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled = false,
  hint,
  formatValue,
}: ParamSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="min-w-12 text-right font-mono text-sm text-muted-foreground">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        disabled={disabled}
      />
    </div>
  )
}
