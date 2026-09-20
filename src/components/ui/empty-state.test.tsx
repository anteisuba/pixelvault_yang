import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Button } from './button'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('renders the title as a heading so screen readers can jump to it', () => {
    render(<EmptyState title="还没有训练过模型" />)
    expect(
      screen.getByRole('heading', { name: '还没有训练过模型' }),
    ).toBeInTheDocument()
  })

  it('renders icon, description and both actions when given', () => {
    render(
      <EmptyState
        icon={<svg data-testid="icon" />}
        title="还没有训练过模型"
        description="挑一个预设，或者直接把图拖进来。"
        action={<Button>挑个预设</Button>}
        secondaryAction={<Button variant="ghost">上传图片</Button>}
      />,
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(
      screen.getByText('挑一个预设，或者直接把图拖进来。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '挑个预设' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上传图片' })).toBeInTheDocument()
  })

  it('puts the title in the display slot — the whole point of the primitive', () => {
    render(<EmptyState title="还没有训练过模型" />)
    expect(
      screen.getByRole('heading', { name: '还没有训练过模型' }).className,
    ).toContain('font-display')
  })

  it('renders no button row when neither action is given', () => {
    render(<EmptyState title="还没有训练过模型" description="先挑个预设。" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('omits the description paragraph when it is not given', () => {
    render(<EmptyState title="还没有训练过模型" />)
    expect(screen.queryByText(/先挑个预设/)).not.toBeInTheDocument()
  })
})
