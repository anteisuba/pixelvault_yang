import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CharacterCardRecord } from '@/types'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(',')}` : key
  return { useTranslations: () => t }
})
// 草稿换算另有测试：这里只看这一排把什么交出去。
vi.mock('@/hooks/cards/use-character-card-editor', () => ({
  draftFromCard: () => ({}),
  updateFromDraft: (_card: unknown, draft: unknown) => draft,
}))

import { CharacterInterests } from './CharacterInterests'

function cardOf(
  interests: string[],
  pinnedFields: string[] = [],
): CharacterCardRecord {
  return {
    persona: { interests },
    pinnedFields,
  } as unknown as CharacterCardRecord
}

describe('CharacterInterests（她在意的东西）', () => {
  it('空着写一句说明；＋ 原地输入，回车加一样', async () => {
    const onUpdate = vi.fn(async () => true)
    render(<CharacterInterests card={cardOf([])} onUpdate={onUpdate} />)
    expect(screen.getByText('interestsEmpty')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'interestsAdd' }))
    const input = screen.getByRole('textbox', { name: 'interestsAdd' })
    fireEvent.change(input, { target: { value: ' 水彩 ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledWith({ interests: ['水彩'] })
  })

  it('× 去掉一样；图钉钉住', () => {
    const onUpdate = vi.fn(async () => true)
    render(
      <CharacterInterests card={cardOf(['水彩', '猫'])} onUpdate={onUpdate} />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'interestsRemove|水彩' }),
    )
    expect(onUpdate).toHaveBeenLastCalledWith({ interests: ['猫'] })
    fireEvent.click(
      screen.getByRole('button', { name: 'pinField|interestsTitle' }),
    )
    expect(onUpdate).toHaveBeenLastCalledWith({ pinnedFields: ['interests'] })
  })

  it('满 12 样不再给 ＋', () => {
    render(
      <CharacterInterests
        card={cardOf(Array.from({ length: 12 }, (_, n) => `x${n}`))}
        onUpdate={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'interestsAdd' }),
    ).not.toBeInTheDocument()
  })
})
