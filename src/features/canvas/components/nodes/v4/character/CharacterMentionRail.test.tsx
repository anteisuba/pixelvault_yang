/** 真轨 + 真 `useCharacterCardUsage`；只假网络：「用她出过的图」那一条走 api-client。 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src as string} alt="" />
  ),
}))

vi.mock('@/lib/api-client/cards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/cards')>()),
  getCharacterCardGenerationsAPI: vi.fn(async () => ({
    success: true,
    data: {
      generations: [{ id: 'g_1', url: 'https://cdn/made.png' }],
      total: 1,
    },
  })),
}))

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { CharacterCardRecord } from '@/types'

import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from '../NodeV4Context'
import { CharacterMentionRail } from './CharacterMentionRail'

const DENIA = {
  id: 'denia',
  name: 'Denia',
  looks: [
    {
      id: 'denia-main',
      isDefault: true,
      tags: [],
      referenceSlots: [
        { id: 's_main', url: 'https://cdn/main.png', isPrimary: true },
      ],
    },
  ],
} as unknown as CharacterCardRecord

function renderRail(
  props: Partial<Parameters<typeof CharacterMentionRail>[0]> = {},
) {
  const onApplyOp = vi.fn()
  render(
    <NodeV4CanvasProvider
      value={{ onApplyOp } as unknown as NodeV4CanvasContextValue}
    >
      <CharacterMentionRail
        nodeId="shot-1"
        mentions={[{ card: DENIA, picks: [{ slotId: 's_main' }] }]}
        capacity={4}
        usedImages={1}
        {...props}
      />
    </NodeV4CanvasProvider>,
  )
  return { onApplyOp }
}

/** 点开她那一格，等「用她出过的」拉回来：主图一张 + 出过的一张。 */
async function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'chipLabel:Denia/1' }))
  await waitFor(() =>
    expect(screen.getAllByTestId('card-picker-image')).toHaveLength(2),
  )
  return screen.getAllByTestId('card-picker-image')
}

describe('参考轨上的 @她（画布用角色 ④ 第 2 片）', () => {
  it('一位一格：角标是这一镜带几张，下面是她的名字', () => {
    renderRail()
    expect(
      screen.getByRole('button', { name: 'chipLabel:Denia/1' }),
    ).toBeTruthy()
    expect(screen.getByText('Denia')).toBeTruthy()
  })

  it('画中框里的角色缩略为 44px 且不占第二行名字', () => {
    renderRail({ expanded: true })
    const chip = screen.getByRole('button', { name: 'chipLabel:Denia/1' })
    expect(chip.className).toContain('size-11')
    expect(chip.className).toContain('rounded-lg')
    expect(screen.queryByText('Denia')).toBeNull()
  })

  it('没有 @ 任何人：整排不渲染', () => {
    renderRail({ mentions: [] })
    expect(document.querySelector('[data-character-mention-rail]')).toBeNull()
  })

  it('点开勾一张 = 发 set_character_picks，按勾的顺序', async () => {
    const { onApplyOp } = renderRail()
    const tiles = await openPicker()
    fireEvent.click(tiles[1]!)
    expect(onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setCharacterPicks,
      target: 'shot-1',
      characterId: 'denia',
      picks: [{ slotId: 's_main' }, { generationId: 'g_1' }],
    })
  })

  it('全部取消 = 回到默认（picks: null）', async () => {
    const { onApplyOp } = renderRail()
    fireEvent.click((await openPicker())[0]!)
    expect(onApplyOp).toHaveBeenCalledWith(
      expect.objectContaining({ picks: null }),
    )
  })

  it('名额满了：没勾的格子勾不上', async () => {
    renderRail({ capacity: 2, usedImages: 1 })
    expect((await openPicker())[1]!.hasAttribute('disabled')).toBe(true)
  })

  it('上限没公布（null）：不卡、不写上限那一行', async () => {
    renderRail({ capacity: null, usedImages: 9 })
    expect((await openPicker())[1]!.hasAttribute('disabled')).toBe(false)
    expect(screen.queryByText(/^limit:/)).toBeNull()
  })
})
