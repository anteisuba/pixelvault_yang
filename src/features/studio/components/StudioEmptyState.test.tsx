import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioEmptyState } from './StudioEmptyState'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// ui-spec §2（owner 11-03）：起手屏只有一句话，输入框在下面。
describe('StudioEmptyState', () => {
  it.each(['image', 'video'] as const)('%s 台只写一句话，没有按钮', (mode) => {
    const { container } = render(<StudioEmptyState mode={mode} />)

    expect(
      screen.getByRole('heading', { name: `title.${mode}` }),
    ).toBeInTheDocument()
    // ⛔ 示例、「继续创作」、「查看操作教程」都不再有。
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelector('.studio-empty-state')).not.toBeNull()
  })
})
