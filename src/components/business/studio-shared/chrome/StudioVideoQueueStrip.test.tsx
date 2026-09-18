import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { RunItem } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { has: () => true }),
}))

import { StudioVideoQueueStrip } from './StudioVideoQueueStrip'

const failed: RunItem = {
  id: 'failed-video',
  modelId: 'demo-video',
  status: 'failed',
  generation: null,
  error: 'ETIMEDOUT after 120000ms',
}

describe('video queue user-facing errors', () => {
  it.each(['cards', 'strip'] as const)(
    'localizes %s failures including tooltip and accessible text',
    (variant) => {
      const { container } = render(
        <StudioVideoQueueStrip
          items={[failed]}
          focusedItemId={null}
          onFocus={vi.fn()}
          onRetry={vi.fn()}
          variant={variant}
        />,
      )
      expect(
        screen.getByText('generation.provider_timeout'),
      ).toBeInTheDocument()
      expect(container.innerHTML).not.toContain('ETIMEDOUT')
    },
  )
})
