import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import zhMessages from '@/messages/zh.json'

import {
  ownWordsOnly,
  StudioOperatorCharacterProfileCard,
  type StudioOperatorCharacterProfileCardProps,
} from './StudioOperatorCharacterProfileCard'

const PROMPT: StudioOperatorCharacterProfileCardProps['prompt'] = {
  id: 'confirm-1',
  kind: 'characterProfile',
  status: 'idle',
  profile: {
    characterId: 'denia',
    fields: [
      {
        field: 'identity',
        text: '星炬学院虚质科学部学生',
        source: '库街区《鸣潮图鉴》',
        sourceUrl: 'https://wiki.kurobbs.com/mc/item/denia',
      },
      {
        field: 'backstory',
        text: '幼时被剧团收留。最后一场演出失手。之后开始独自守夜。',
        source: '你写的 + 我补的',
        added: ['最后一场演出失手。'],
      },
    ],
  },
}

function renderCard(
  overrides: Partial<StudioOperatorCharacterProfileCardProps> = {},
) {
  const onKeep = vi.fn()
  const onDismiss = vi.fn()
  render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <StudioOperatorCharacterProfileCard
        prompt={PROMPT}
        characterName="Denia"
        assistantName="达妮娅"
        onKeep={onKeep}
        onDismiss={onDismiss}
        formatTime={() => '11:24'}
        {...overrides}
      />
    </NextIntlClientProvider>,
  )
  return { onKeep, onDismiss }
}

describe('StudioOperatorCharacterProfileCard（设定提议卡）', () => {
  it('每格一个勾、下面一行来源；默认全勾，收下交出整份', () => {
    const { onKeep } = renderCard()
    expect(screen.getByText('收进「Denia」？')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: '库街区《鸣潮图鉴》' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByTestId('operator-character-profile-keep'))
    expect(onKeep).toHaveBeenCalledWith(PROMPT.profile.fields)
  })

  it('取消一格的勾只交剩下的；「只留我写的」去掉助手补的句子', () => {
    const { onKeep } = renderCard()
    fireEvent.click(screen.getByLabelText('身份'))
    fireEvent.click(screen.getByRole('button', { name: '只留我写的' }))
    fireEvent.click(screen.getByTestId('operator-character-profile-keep'))
    expect(onKeep).toHaveBeenCalledWith([
      expect.objectContaining({
        field: 'backstory',
        text: '幼时被剧团收留。之后开始独自守夜。',
        added: [],
      }),
    ])
  })

  it('已收下之后整卡收成一行「已收下 N 格 · 时间」', () => {
    renderCard({
      prompt: {
        ...PROMPT,
        status: 'confirmed',
        keptCount: 2,
        decidedAt: '2026-09-27T03:24:00Z',
      },
    })
    expect(screen.getByText('已收下 2 格 · 11:24')).toBeTruthy()
    expect(screen.queryByTestId('operator-character-profile-keep')).toBeNull()
  })

  it('ownWordsOnly：只去掉标出的句子', () => {
    expect(ownWordsOnly('甲。乙。丙。', ['乙。'])).toBe('甲。丙。')
    expect(ownWordsOnly('甲。', undefined)).toBe('甲。')
  })
})
