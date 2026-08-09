/**
 * 阶段 3「参考图落散图节点 + 自动连线」的落点回归。
 *
 * 守的是**方向**而不是像素：加一张参考图必须变成画布上的一个节点 + 一条边，
 * 不能再悄悄写进宿主节点的 `referenceAssets`（那条隐形附件通道正是本轮要拆的
 * 第二套机制 —— 图在画布上不存在，只能从详情面板里看见）。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { GenerationRecord } from '@/types'

import type { SpawnReferenceInput } from './NodeWorkflowActionsContext'
import {
  ReferenceLandingTabs,
  type ResolvedReferenceMedia,
} from './ReferenceLandingTabs'

const spawnReference = vi.fn<(input: SpawnReferenceInput) => string | null>(
  () => 'new-node-id',
)

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({ spawnReference }),
}))

vi.mock('@/hooks/node/use-node-reference-upload', () => ({
  useNodeReferenceUpload: () => ({
    uploadFile: vi.fn(),
    isUploading: false,
  }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    onConfirmMany,
  }: {
    open: boolean
    onConfirmMany?: (generations: GenerationRecord[]) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onConfirmMany?.([
            {
              id: 'gen-1',
              url: 'https://cdn.example.com/a.png',
              prompt: '雨夜街道',
            } as GenerationRecord,
            {
              id: 'gen-2',
              url: 'https://cdn.example.com/b.png',
              prompt: '',
            } as GenerationRecord,
          ])
        }
      >
        confirm-two-assets
      </button>
    ) : null,
}))

describe('ReferenceLandingTabs · 素材库选入 → 落散图节点', () => {
  it('每张图各落一个节点，全部连到宿主，且不带 role', () => {
    spawnReference.mockClear()
    render(<ReferenceLandingTabs targetNodeId="host-1" />)

    fireEvent.mouseDown(screen.getByText('assetTab'))
    fireEvent.click(screen.getByText('selectAsset'))
    fireEvent.click(screen.getByText('confirm-two-assets'))

    expect(spawnReference).toHaveBeenCalledTimes(2)
    expect(spawnReference).toHaveBeenNthCalledWith(1, {
      targetNodeId: 'host-1',
      nodeType: NODE_TYPE_IDS.image,
      media: {
        url: 'https://cdn.example.com/a.png',
        generationId: 'gen-1',
        name: '雨夜街道',
      },
    })
    // ⚠ 没有 `role` 这个键 —— 落的是散图，分类是节点自己的事（`imageCategory`），
    // 落地时不替用户猜成角色/背景/镜头。
    expect(spawnReference.mock.calls[0][0]).not.toHaveProperty('role')
    // 空 prompt 不该变成空字符串名字（未命名素材在槽架里靠族名兜底）。
    expect(spawnReference.mock.calls[1][0].media.name).toBeUndefined()
  })

  it('收集器卡覆盖落点时，一个节点都不建 —— 两条路互斥', () => {
    spawnReference.mockClear()
    const onResolved = vi.fn<(media: ResolvedReferenceMedia) => void>()
    render(
      <ReferenceLandingTabs targetNodeId="host-1" onResolved={onResolved} />,
    )

    fireEvent.mouseDown(screen.getByText('assetTab'))
    fireEvent.click(screen.getByText('selectAsset'))
    fireEvent.click(screen.getByText('confirm-two-assets'))

    expect(spawnReference).not.toHaveBeenCalled()
    expect(onResolved).toHaveBeenCalledTimes(2)
    // `source` 必须一路带到旧落点：`createReferenceAsset` 靠它区分
    // upload / asset / paste，丢了图集条目的来源标就没了。
    expect(onResolved.mock.calls[0][0]).toMatchObject({ source: 'asset' })
  })

  it('上限 0 的节点（该模式不吃参考图）：三个 Tab 的输入面全部禁用', () => {
    render(<ReferenceLandingTabs targetNodeId="host-1" disabled />)
    expect(screen.getByText('uploadTitle').closest('button')).toBeDisabled()
    fireEvent.mouseDown(screen.getByText('assetTab'))
    expect(screen.getByText('selectAsset').closest('button')).toBeDisabled()
  })
})
