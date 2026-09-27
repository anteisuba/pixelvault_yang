import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import zhMessages from '@/messages/zh.json'

import {
  StudioOperatorCharacterImagesCard,
  type StudioOperatorCharacterImagesCardProps,
} from './StudioOperatorCharacterImagesCard'
import {
  StudioOperatorImageHandoffCard,
  type StudioOperatorImageHandoffCardProps,
} from './StudioOperatorImageHandoffCard'

const PROMPT: StudioOperatorCharacterImagesCardProps['prompt'] = {
  id: 'confirm-1',
  kind: 'characterImages',
  status: 'idle',
  proposal: {
    characterId: 'denia',
    images: [
      {
        key: 'asset:gen-1',
        source: 'library',
        url: 'https://cdn.test/1.png',
        reason: '正面半身，脸清楚',
        assetId: 'gen-1',
        displayName: '宣传立绘',
      },
      {
        key: 'web:https://cdn.test/full.jpg',
        source: 'web',
        url: 'https://cdn.test/full.jpg',
        reason: '全身，服装完整',
        pageUrl: 'https://wiki.example.test/denia',
        domain: 'wiki.example.test',
      },
    ],
  },
}

function renderImages(
  overrides: Partial<StudioOperatorCharacterImagesCardProps> = {},
) {
  const onKeep = vi.fn()
  const onDismiss = vi.fn()
  render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <StudioOperatorCharacterImagesCard
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

describe('StudioOperatorCharacterImagesCard（候选图卡）', () => {
  it('每张一个勾 + 为什么选它 + 出处；默认全勾，取消一张后只挂剩下的', () => {
    const { onKeep } = renderImages()
    expect(screen.getByText('挂到「Denia」上？')).toBeTruthy()
    expect(screen.getByText('素材库 · 宣传立绘')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'wiki.example.test' }),
    ).toHaveAttribute('href', 'https://wiki.example.test/denia')
    fireEvent.click(screen.getByLabelText('全身，服装完整'))
    fireEvent.click(screen.getByRole('button', { name: '挂上勾选的 · 1' }))
    expect(onKeep).toHaveBeenCalledWith(['asset:gen-1'])
  })

  it('一张都不勾时「挂上」点不了；「不用」交给驱动 hook', () => {
    const { onDismiss } = renderImages()
    fireEvent.click(screen.getByLabelText('正面半身，脸清楚'))
    fireEvent.click(screen.getByLabelText('全身，服装完整'))
    expect(
      screen.getByRole('button', { name: '挂上勾选的 · 0' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '不用' }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('已决之后收成一行：挂上了几张 · 时间', () => {
    renderImages({
      prompt: {
        ...PROMPT,
        status: 'confirmed',
        keptCount: 2,
        decidedAt: '2026-09-27T02:24:00.000Z',
      },
    })
    expect(screen.getByText('已挂上 2 张 · 11:24')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

const HANDOFF: StudioOperatorImageHandoffCardProps['prompt'] = {
  id: 'confirm-2',
  kind: 'imageHandoff',
  status: 'idle',
  handoff: {
    characterId: 'denia',
    request: '给 Denia 出一张定妆三视图：正面、侧面、背面全身，白底',
  },
}

describe('StudioOperatorImageHandoffCard（交给图片助手）', () => {
  it('写出要对图片助手说的那句话与会发生什么；两颗键各交给驱动 hook', () => {
    const onAccept = vi.fn()
    const onDismiss = vi.fn()
    render(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <StudioOperatorImageHandoffCard
          prompt={HANDOFF}
          characterName="Denia"
          assistantName="达妮娅"
          onAccept={onAccept}
          onDismiss={onDismiss}
          formatTime={() => '11:24'}
        />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText(HANDOFF.handoff.request)).toBeTruthy()
    expect(screen.getByText(/你来按发送/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '交给图片助手' }))
    expect(onAccept).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '先不要' }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
