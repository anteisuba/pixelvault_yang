'use client'

import {
  useCallback,
  useState,
  type ChangeEvent,
  type CompositionEvent as ReactCompositionEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

/**
 * Controlled inputs lose their IME composition buffer when the parent state
 * round-trips back into the `value` prop mid-composition — pinyin or kana
 * keystrokes get clobbered before the user can commit. The fix is to keep
 * the DOM under a local buffer until `compositionend`, then push the final
 * composed string up to the parent in one onChange.
 *
 * These two wrappers are drop-in replacements for `<input>` and `<textarea>`
 * that the studio-node inspectors use heavily. Outside of the studio nodes
 * the shadcn primitives are fine — most surfaces don't see CJK input.
 */

interface IMEControlledProps<TValue extends string> {
  value: TValue
  onValueChange: (value: TValue) => void
}

export type IMEAwareInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> &
  IMEControlledProps<string>

export function IMEAwareInput({
  value,
  onValueChange,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: IMEAwareInputProps) {
  const [local, setLocal] = useState(value)
  // Track the last synced parent value to detect prop-driven changes during
  // render — derived state per the React 19 guidance for "adjusting state on
  // prop change" (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [lastSyncedValue, setLastSyncedValue] = useState(value)
  // Composition state is React state (not a ref) so we can read it during
  // render without violating the no-refs-during-render rule.
  const [isComposing, setIsComposing] = useState(false)

  // Sync down from parent only when the user is NOT mid-composition. If they
  // are, the parent's view is provisionally stale; we'll catch them back up
  // when compositionend fires.
  if (value !== lastSyncedValue && !isComposing) {
    setLastSyncedValue(value)
    setLocal(value)
  }

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value
      setLocal(next)
      if (!isComposing) {
        onValueChange(next)
      }
    },
    [isComposing, onValueChange],
  )

  const handleCompositionStart = useCallback(
    (event: ReactCompositionEvent<HTMLInputElement>) => {
      setIsComposing(true)
      onCompositionStart?.(event)
    },
    [onCompositionStart],
  )

  const handleCompositionEnd = useCallback(
    (event: ReactCompositionEvent<HTMLInputElement>) => {
      setIsComposing(false)
      const next = event.currentTarget.value
      setLocal(next)
      onValueChange(next)
      onCompositionEnd?.(event)
    },
    [onCompositionEnd, onValueChange],
  )

  return (
    <input
      {...props}
      value={local}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  )
}

export type IMEAwareTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> &
  IMEControlledProps<string>

export function IMEAwareTextarea({
  value,
  onValueChange,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: IMEAwareTextareaProps) {
  const [local, setLocal] = useState(value)
  const [lastSyncedValue, setLastSyncedValue] = useState(value)
  const [isComposing, setIsComposing] = useState(false)

  if (value !== lastSyncedValue && !isComposing) {
    setLastSyncedValue(value)
    setLocal(value)
  }

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const next = event.target.value
      setLocal(next)
      if (!isComposing) {
        onValueChange(next)
      }
    },
    [isComposing, onValueChange],
  )

  const handleCompositionStart = useCallback(
    (event: ReactCompositionEvent<HTMLTextAreaElement>) => {
      setIsComposing(true)
      onCompositionStart?.(event)
    },
    [onCompositionStart],
  )

  const handleCompositionEnd = useCallback(
    (event: ReactCompositionEvent<HTMLTextAreaElement>) => {
      setIsComposing(false)
      const next = event.currentTarget.value
      setLocal(next)
      onValueChange(next)
      onCompositionEnd?.(event)
    },
    [onCompositionEnd, onValueChange],
  )

  return (
    <textarea
      {...props}
      value={local}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  )
}
