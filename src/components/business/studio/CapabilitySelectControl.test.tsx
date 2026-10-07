import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CapabilitySelectControl } from './CapabilitySelectControl'
import type { CapabilityChip } from '@/lib/model-capability-chips'

/** 选项名在这里直接取 key 的最后一段，模拟真实的短中文标签。 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key.split('.').pop() ?? key,
}))

const chip = (options: string[]): CapabilityChip =>
  ({
    capability: 'quality',
    kind: 'select',
    options,
    defaultValue: options[0],
    modelIndexes: [0],
  }) as unknown as CapabilityChip

describe('CapabilitySelectControl（「专属」A1）', () => {
  it('选项少、字短：排成一条分段', () => {
    render(
      <CapabilitySelectControl
        chip={chip(['auto', 'low', 'high'])}
        value="auto"
        label="画质"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: '画质' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('选项多：收成下拉', () => {
    render(
      <CapabilitySelectControl
        chip={chip(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])}
        value="a"
        label="采样器"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox', { name: '采样器' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })
})
