import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src as string} alt="" data-testid="mention-thumb" />
  ),
}))

import { MentionChip } from './MentionChip'

describe('MentionChip', () => {
  it('默认不显示角色前缀（无前缀的引用不该长出「参考」两个字）', () => {
    render(<MentionChip name="莫宁" />)
    expect(screen.getByText('@莫宁')).toBeInTheDocument()
  })

  it('显式角色才带前缀，并把角色写进 data 属性供 S4 落槽', () => {
    const { container } = render(
      <MentionChip name="S02 站台图" role="firstFrame" showRole />,
    )
    expect(
      container.querySelector('[data-mention-chip="firstFrame"]'),
    ).not.toBeNull()
    expect(screen.getByText(/slots.firstFrame/)).toBeInTheDocument()
  })

  it('图 / 视频给 16px 缩略，语音给波形小标（⛔ 语音不去拉图）', () => {
    const { rerender, container } = render(
      <MentionChip
        name="a"
        media={{ kind: 'image', thumbnailUrl: '/a.png' }}
      />,
    )
    expect(screen.getByTestId('mention-thumb')).toBeInTheDocument()

    rerender(<MentionChip name="b" media={{ kind: 'audio' }} />)
    expect(screen.queryByTestId('mention-thumb')).toBeNull()
    expect(container.querySelectorAll('i')).toHaveLength(3)
  })
})
