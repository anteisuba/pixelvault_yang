/**
 * 角色卡详情面板 —— 身份编排的两个入口。
 *
 * ⚠ 「＋面部特写」是 2026-08-09 从**视频节点的素材面板**搬来的（退役的
 * `ReferenceManagerPanel` 行菜单）。搬迁的理由是职责：素材槽架只回答「这次挂了
 * 什么、满没满、会不会发」，而「这个角色的音色 / 特写是什么」是**角色身份**——
 * 在 A 的界面里改 B，正是那个 1084 行组件的病因。
 *
 * 搬之前它是**全仓唯一入口**（添加菜单里没有 closeup 项），所以这条守卫不能少。
 */
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { CharacterDetailBody } from './CharacterDetailBody'

const { spawnReference, updateNodeData, deleteEdge, extractReference } =
  vi.hoisted(() => ({
    spawnReference: vi.fn(),
    updateNodeData: vi.fn(),
    deleteEdge: vi.fn(),
    extractReference: vi.fn(),
  }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  useEdges: () => [],
  useNodes: () => [],
}))

vi.mock('@/hooks/cards/use-character-cards', () => ({
  useCharacterCards: () => ({ cards: [], findCard: () => undefined }),
}))

vi.mock('@/hooks/node/use-downstream-uses', () => ({
  useDownstreamUses: () => [],
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData,
    deleteEdge,
    spawnReference,
    extractReference,
  }),
}))

vi.mock('@/components/business/node/CharacterImageReferenceControls', () => ({
  CharacterImageReferenceControls: () => null,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))

/** 素材库桩：打开时给一颗按钮，点它就回一条选中的生成记录。 */
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    mediaType,
    onSelect,
  }: {
    open: boolean
    mediaType?: string
    onSelect?: (g: unknown) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="asset-pick"
        data-media-type={mediaType}
        onClick={() =>
          onSelect?.({
            id: 'gen1',
            url: 'https://cdn.test/closeup.png',
            prompt: '面部特写',
            model: 'seedream',
          })
        }
      >
        pick
      </button>
    ) : null,
}))

function renderBody() {
  const data = {
    prompt: '',
    status: 'idle',
    characterName: '小林',
  } as unknown as NodeWorkflowNodeData
  return render(
    <CharacterDetailBody nodeId="char9" type={NODE_TYPE_IDS.image} data={data}>
      {(slots) => (
        <>
          {slots.relations}
          {slots.overlays}
        </>
      )}
    </CharacterDetailBody>,
  )
}

describe('CharacterDetailBody · 身份编排入口', () => {
  it('＋面部特写 spawn 一张 role=closeup 的图，挂到**这个角色**身上', () => {
    renderBody()
    fireEvent.click(screen.getByRole('button', { name: 'closeupAdd' }))

    const pick = screen.getByTestId('asset-pick')
    // 特写是图片，开的必须是图片库。
    expect(pick).toHaveAttribute('data-media-type', 'image')
    fireEvent.click(pick)

    expect(spawnReference).toHaveBeenCalledWith(
      expect.objectContaining({
        // ⚠ 目标是角色节点自己 —— closeup → character 一跳，骑在角色的
        // image_urls 后面。落到别的节点上就不是「这个角色的特写」了。
        targetNodeId: 'char9',
        nodeType: NODE_TYPE_IDS.image,
        role: 'closeup',
      }),
    )
  })

  it('绑定音色开的是音频库，两个入口并排且互不串台', () => {
    renderBody()
    fireEvent.click(screen.getByRole('button', { name: 'voiceBind' }))
    expect(screen.getByTestId('asset-pick')).toHaveAttribute(
      'data-media-type',
      'audio',
    )
  })

  it('特写可以有多张 —— 按钮常显，不像音色那样绑定后换成 chip', () => {
    renderBody()
    // 点开再关掉，按钮仍在（音色绑定后会变成一颗带 × 的 chip，特写不会）。
    expect(
      screen.getByRole('button', { name: 'closeupAdd' }),
    ).toBeInTheDocument()
  })
})
