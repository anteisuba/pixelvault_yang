import { cn } from '@/lib/utils'

interface OptionGroupItem {
  value: string
  label: string
}

interface OptionGroupProps {
  options: readonly OptionGroupItem[] | readonly string[]
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
  allowDeselect?: boolean
  /** Visual style variant */
  variant?: 'primary' | 'neutral'
}

/**
 * Generic pill-button group for selecting from a list of options.
 * Used for aspect ratio, duration, resolution, etc.
 */
export function OptionGroup({
  options,
  value,
  onChange,
  disabled = false,
  allowDeselect = false,
  variant = 'primary',
}: OptionGroupProps) {
  const normalizedOptions: OptionGroupItem[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt,
  )

  return (
    <div className="flex flex-wrap gap-2">
      {normalizedOptions.map((opt) => {
        const isSelected = value === opt.value

        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (allowDeselect && isSelected) {
                onChange('')
              } else {
                onChange(opt.value)
              }
            }}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
              isSelected
                ? variant === 'primary'
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'bg-foreground text-background'
                : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
