import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CharacterStickerRecord } from '@/types/character-sticker'

vi.mock('next-intl', () => {
  const t = (key: string) => key
  return { useTranslations: () => t }
})
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { CharacterStickersPane } from './CharacterStickersPane'

const sticker = (
  patch: Partial<CharacterStickerRecord> = {},
): CharacterStickerRecord => ({
  id: 's1',
  url: 'https://cdn/s1.png',
  sourceUrl: null,
  whenToUse: '被夸的时候发',
  isBlocked: false,
  fromCreator: false,
  createdAt: '2026-10-30T00:00:00.000Z',
  sentAt: null,
  ...patch,
})

function hookOf(rows: CharacterStickerRecord[]) {
  return {
    stickers: rows,
    upload: vi.fn(async () => ({ ok: true as const })),
    setBlocked: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  } as unknown as Parameters<typeof CharacterStickersPane>[0]['stickers']
}

describe('CharacterStickersPane（她页表情包，第 ⑨ 步）', () => {
  it('每张底下写她那句「什么时候发」，悬停药丸拉黑 / 恢复', async () => {
    const hook = hookOf([
      sticker(),
      sticker({ id: 's2', isBlocked: true, whenToUse: '生气时' }),
    ])
    render(<CharacterStickersPane stickers={hook} />)
    expect(screen.getByText('被夸的时候发')).toBeTruthy()
    expect(screen.getByText('feedSticker')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'blockSticker' }))
    fireEvent.click(screen.getByRole('button', { name: 'unblockSticker' }))
    await waitFor(() => {
      expect(hook.setBlocked).toHaveBeenCalledWith('s1', true)
      expect(hook.setBlocked).toHaveBeenCalledWith('s2', false)
    })
  })

  it('删除先确认', async () => {
    const hook = hookOf([sticker()])
    render(<CharacterStickersPane stickers={hook} />)
    fireEvent.click(screen.getByRole('button', { name: 'deleteSticker' }))
    fireEvent.click(await screen.findByRole('button', { name: 'delete' }))
    await waitFor(() => expect(hook.remove).toHaveBeenCalledWith('s1'))
  })
})
