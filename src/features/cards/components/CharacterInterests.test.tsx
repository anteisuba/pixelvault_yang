import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CharacterCardRecord } from '@/types'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(',')}` : key
  return { useTranslations: () => t }
})

import { CharacterInterests } from './CharacterInterests'

function cardOf(
  interests: string[],
  pinnedFields: string[] = [],
): CharacterCardRecord {
  return {
    name: 'Denia',
    summary: null,
    workOverride: null,
    voiceCardId: null,
    persona: { interests },
    pinnedFields,
  } as unknown as CharacterCardRecord
}

/** 交出去的是整份更新请求（真 `updateFromDraft`）：只看这一排管的那几格。 */
const interestsSent = (interests: string[]) =>
  expect.objectContaining({
    persona: expect.objectContaining({ interests }),
  })

describe('CharacterInterests（她在意的东西）', () => {
  it('空着写一句说明；＋ 原地输入，回车加一样', async () => {
    const onUpdate = vi.fn(async () => true)
    render(<CharacterInterests card={cardOf([])} onUpdate={onUpdate} />)
    expect(screen.getByText('interestsEmpty')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'interestsAdd' }))
    const input = screen.getByRole('textbox', { name: 'interestsAdd' })
    fireEvent.change(input, { target: { value: ' 水彩 ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledWith(interestsSent(['水彩']))
  })

  it('× 去掉一样；图钉钉住', () => {
    const onUpdate = vi.fn(async () => true)
    render(
      <CharacterInterests card={cardOf(['水彩', '猫'])} onUpdate={onUpdate} />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'interestsRemove|水彩' }),
    )
    expect(onUpdate).toHaveBeenLastCalledWith(interestsSent(['猫']))
    fireEvent.click(
      screen.getByRole('button', { name: 'pinField|interestsTitle' }),
    )
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extensions: expect.objectContaining({
          'pv.pinnedFields': ['interests'],
        }),
      }),
    )
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
