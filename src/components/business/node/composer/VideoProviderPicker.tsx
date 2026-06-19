'use client'

import { type KeyboardEvent } from 'react'

import { type AI_ADAPTER_TYPES } from '@/constants/providers'

interface VideoProviderPickerProps {
  providers: AI_ADAPTER_TYPES[]
  currentProvider: AI_ADAPTER_TYPES | null
  providerLabel(provider: AI_ADAPTER_TYPES): string
  ariaLabel: string
  onSelectProvider(provider: AI_ADAPTER_TYPES): void
}

function stopCanvasKey(event: KeyboardEvent<HTMLElement>) {
  event.stopPropagation()
}

/**
 * Low-key fal / VolcEngine provider selector. Same capabilities either side —
 * this only changes the route/key (BYOK). Rendered only when a brand actually
 * has >1 provider available (today: Seedance). Subordinate to the switcher.
 */
export function VideoProviderPicker({
  providers,
  currentProvider,
  providerLabel,
  ariaLabel,
  onSelectProvider,
}: VideoProviderPickerProps) {
  if (providers.length < 2) return null

  return (
    <select
      value={currentProvider ?? providers[0]}
      aria-label={ariaLabel}
      onKeyDownCapture={stopCanvasKey}
      onKeyUpCapture={stopCanvasKey}
      onChange={(event) =>
        onSelectProvider(event.target.value as AI_ADAPTER_TYPES)
      }
      className="nodrag h-7 w-full rounded-lg border border-node-panel-inner bg-node-panel px-2 text-2xs font-medium text-node-muted outline-none focus-visible:border-node-edge"
    >
      {providers.map((provider) => (
        <option key={provider} value={provider}>
          {providerLabel(provider)}
        </option>
      ))}
    </select>
  )
}
