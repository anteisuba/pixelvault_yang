import { OptionGroup } from '@/components/ui/option-group'

interface OptionItem {
  value: string
  label: string
}

interface AspectRatioSelectorProps {
  options: readonly OptionItem[] | readonly string[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  variant?: 'primary' | 'neutral'
}

/**
 * Aspect ratio pill selector. Thin wrapper around OptionGroup
 * for semantic clarity in generation forms.
 */
export function AspectRatioSelector({
  options,
  value,
  onChange,
  disabled,
  variant = 'primary',
}: AspectRatioSelectorProps) {
  return (
    <OptionGroup
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      variant={variant}
    />
  )
}
