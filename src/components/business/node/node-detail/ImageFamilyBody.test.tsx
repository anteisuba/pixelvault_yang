import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => [],
  useEdges: () => [],
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

vi.mock('@/hooks/node/use-node-reference-upload', () => ({
  useNodeReferenceUpload: () => ({ uploadFile: vi.fn(), isUploading: false }),
}))

vi.mock('@/hooks/cards/use-character-cards', () => ({
  useCharacterCards: () => ({ cards: [], findCard: () => null }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock('@/components/business/node/CharacterImageReferenceControls', () => ({
  CharacterImageReferenceControls: () => (
    <button type="button">reference-controls</button>
  ),
}))

vi.mock('@/components/business/node/WorkflowModelPicker', () => ({
  WorkflowModelPicker: () => <div>model-picker</div>,
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData: vi.fn(),
    deleteEdge: vi.fn(),
    generateMediaNode: vi.fn(),
    extractReference: vi.fn(),
    spawnReference: vi.fn(),
    modelOptionsByType: {},
  }),
}))

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { CharacterDetailBody } from './CharacterDetailBody'
import { FrameDetailBody } from './FrameDetailBody'
import { NodeDetailFrame } from './NodeDetailFrame'
import type { NodeDetailSlots } from './slots'

function slotOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-node-detail-slot]')).map(
    (element) => element.getAttribute('data-node-detail-slot') ?? '',
  )
}

function renderFamily(
  Family: (props: {
    nodeId: string
    type: (typeof NODE_TYPE_IDS)[keyof typeof NODE_TYPE_IDS]
    data: NodeWorkflowNodeData
    children: (slots: NodeDetailSlots) => ReactNode
  }) => ReactNode,
  type: (typeof NODE_TYPE_IDS)[keyof typeof NODE_TYPE_IDS],
  data: NodeWorkflowNodeData,
) {
  return render(
    <Family nodeId="node-1" type={type} data={data}>
      {(slots) => (
        <NodeDetailFrame identity={<span>identity</span>} slots={slots} />
      )}
    </Family>,
  )
}

describe('图片族 × 七槽（S4）', () => {
  /**
   * ⚠ 这条断言守的是契约里唯一「不可推翻」的一条：**槽序 = DOM 序 = 键盘序**。
   * 方向 C 就是因为桌面 Tab 序跳成 3→5→2→4→6→7 被判出局，而 Tab 序在没有
   * tabindex 的前提下就是 DOM 序 —— 所以查 DOM 序等于查键盘序。
   */
  it('媒体井族按 2→3→4→5→6→7 排布，一格不跳', () => {
    const { container } = renderFamily(
      FrameDetailBody,
      NODE_TYPE_IDS.frameImage,
      {
        prompt: '',
        status: NODE_STATUS_IDS.idle,
      },
    )

    expect(slotOrder(container)).toEqual([
      'identity-bar',
      'subject-stage',
      'compose-desk',
      'source-rack',
      'relations-strip',
      'evidence-drawer',
      'action-dock',
    ])
  })

  /**
   * 契约 §6 给角色族的是「素材架整栏不渲染 · 编排台空 · 动作坞空」。
   * ⚠ 判据是**整栏不在 DOM 里**，不是「渲染了一个空 div」——后者仍占 R12 的槽间距，
   * 面板上会出现三段说不清来历的空白。
   */
  it('角色族的素材架/编排台/动作坞整栏不渲染，关系带与证据抽屉仍在位', () => {
    const { container } = renderFamily(
      CharacterDetailBody,
      NODE_TYPE_IDS.characterImage,
      { prompt: '', characterName: '小林', status: NODE_STATUS_IDS.idle },
    )

    expect(slotOrder(container)).toEqual([
      'identity-bar',
      'subject-stage',
      'relations-strip',
      'evidence-drawer',
    ])
  })

  /**
   * R2「空态：占几何可以，占内容不行」。旧实现的空态是一块虚线框 + 「上传图片」
   * 标题 + 「点击 / 拖拽 / 粘贴 (Ctrl+V)」说明行 —— 三样都是 R2 点名要删的。
   * 上传这条路本身没删（井仍可点可拖可粘贴，素材架里还有一颗显式按钮）。
   */
  it('空井不出现说明文案，但仍是可操作的上传落点', () => {
    renderFamily(FrameDetailBody, NODE_TYPE_IDS.frameImage, {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    })

    expect(screen.queryByText('dropzoneHint')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'existing.upload' }),
    ).toBeInTheDocument()
  })

  it('keeps one reference entry and removes duplicate Studio and LoRA controls', () => {
    renderFamily(FrameDetailBody, NODE_TYPE_IDS.frameImage, {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    })

    expect(screen.getAllByText('fieldReferences')).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: 'reference-controls' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('openStudio')).not.toBeInTheDocument()
    expect(screen.queryByText('lora-controls')).not.toBeInTheDocument()
    expect(screen.queryByText('fieldLoras')).not.toBeInTheDocument()
  })

  it('keeps main-image replacement separate from adding a reference', () => {
    renderFamily(FrameDetailBody, NODE_TYPE_IDS.frameImage, {
      prompt: '',
      mediaUrl: 'https://example.com/frame.png',
      status: NODE_STATUS_IDS.done,
    })

    expect(
      screen.getByRole('button', { name: 'replaceImage' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'reference-controls' }),
    ).toBeInTheDocument()
  })

  /**
   * 契约 §7：生成中「无百分比、无取消、**无进度条**」。
   * ⚠ 查 `role=progressbar` 而不是查 class —— 换皮肤时 class 会变，
   * 而「有没有一个进度条」这件事在无障碍树上是确定的。
   */
  it('生成中不出现进度条', () => {
    renderFamily(FrameDetailBody, NODE_TYPE_IDS.frameImage, {
      prompt: '一只猫',
      status: NODE_STATUS_IDS.running,
      generationStatus: NODE_GENERATION_STATUS_IDS.pending,
    })

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
