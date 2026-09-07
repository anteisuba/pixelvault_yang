// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { setOperatorReviewState } from '@/hooks/use-studio-operator-store'

import { StudioVideoReferenceSlots } from './StudioVideoReferenceSlots'

/**
 * 视频工作台的**三个具名槽**（第二期）。
 *
 * 钉五件事：
 *  ① 按当前模型的发送契约显隐 —— 不支持尾帧的模型**不渲染**尾帧槽，
 *    ⛔ 不摆一个点不动的禁用占位；
 *  ② 拖一张图进首帧槽真的落在**首帧**上（不是「追加到参考图列表」）；
 *  ③ 清空首帧**不动尾帧** —— 位置承载那套的病根就在这里（删第一张 = 尾帧升级）；
 *  ④ 素材库那条路落的是同一个 action；
 *  ⑤ 一个槽都不该出现时整块不渲染（⛔ 不留一个空标题）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key
    return t
  },
}))

/** 拒绝那一句要**说出来** —— 这个桩就是「有没有说话」的证据。 */
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const dispatch = vi.hoisted(() => vi.fn())
const formState = vi.hoisted(() => ({
  current: {
    videoFrameSlots: {
      first: null as string | null,
      last: null as string | null,
    },
    videoReferenceVideos: [] as string[],
  },
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: formState.current, dispatch }),
}))

/** 素材库弹窗桩 —— 只暴露一颗「挑中这个」，避免把整棵浏览器树拖进用例。 */
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    onSelect,
  }: {
    open: boolean
    onSelect?: (generation: { url: string; outputType: string }) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="asset-picker-pick"
        onClick={() =>
          onSelect?.({
            url: 'https://cdn.example.com/from-library.png',
            outputType: 'IMAGE',
          })
        }
      />
    ) : null,
}))

const SEEDANCE_25 = {
  modelId: AI_MODELS.SEEDANCE_25_VOLCENGINE,
  adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
}

beforeEach(() => {
  dispatch.mockClear()
  toastError.mockClear()
  formState.current = {
    videoFrameSlots: { first: null, last: null },
    videoReferenceVideos: [],
  }
})

function dropUrl(testId: string, url: string, assetIds?: readonly string[]) {
  fireEvent.drop(screen.getByTestId(testId), {
    dataTransfer: {
      files: [],
      getData: (type: string) => {
        if (type === 'text/uri-list') return url
        // 画廊格子拖动时同时写库内 id（`ASSET_DND_MIME`）与那条 uri-list。
        if (type === ASSET_DND_MIME && assetIds) {
          return JSON.stringify(assetIds)
        }
        return ''
      },
    },
  })
}

describe('视频具名参考槽', () => {
  it('Seedance 2.5 关键帧档：首帧与尾帧两个槽都在', () => {
    render(<StudioVideoReferenceSlots selectedModel={SEEDANCE_25} />)
    expect(screen.getByTestId('video-slot-first')).toBeInTheDocument()
    expect(screen.getByTestId('video-slot-last')).toBeInTheDocument()
  })

  it('拖一张图进首帧槽 —— 落在首帧上，⛔ 不是追加进参考图列表', () => {
    render(<StudioVideoReferenceSlots selectedModel={SEEDANCE_25} />)
    dropUrl('video-slot-first', 'https://cdn.example.com/a.png')

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_FRAME_SLOT',
      payload: { slot: 'first', url: 'https://cdn.example.com/a.png' },
    })
  })

  it('拖进尾帧槽落的是尾帧 —— 两个槽各是各的', () => {
    render(<StudioVideoReferenceSlots selectedModel={SEEDANCE_25} />)
    dropUrl('video-slot-last', 'https://cdn.example.com/z.png')

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_FRAME_SLOT',
      payload: { slot: 'last', url: 'https://cdn.example.com/z.png' },
    })
  })

  it('⭐ 清空首帧只清首帧 —— 尾帧一个字都不该动（位置承载那套的病根）', () => {
    formState.current = {
      videoFrameSlots: {
        first: 'https://cdn.example.com/a.png',
        last: 'https://cdn.example.com/z.png',
      },
      videoReferenceVideos: [],
    }
    render(<StudioVideoReferenceSlots selectedModel={SEEDANCE_25} />)

    fireEvent.click(screen.getByTestId('video-slot-first-clear'))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_FRAME_SLOT',
      payload: { slot: 'first', url: null },
    })
  })

  it('素材库那条路落的是同一个 action', () => {
    render(<StudioVideoReferenceSlots selectedModel={SEEDANCE_25} />)

    // ⚠ 点的是槽里那颗按钮（testid 在外层的 drop 容器上）。
    fireEvent.click(screen.getByLabelText('firstFrame'))
    fireEvent.click(screen.getByTestId('asset-picker-pick'))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_FRAME_SLOT',
      payload: {
        slot: 'first',
        url: 'https://cdn.example.com/from-library.png',
      },
    })
  })

  it('没选模型时整块不渲染（⛔ 不留一个空标题）', () => {
    render(<StudioVideoReferenceSlots selectedModel={null} />)
    expect(
      screen.queryByTestId('studio-video-reference-slots'),
    ).not.toBeInTheDocument()
  })
})

/**
 * 切片 Y —— **已否的产物进不了首尾帧槽**。钉三件：拒的时候一个 dispatch 都不发、
 * 拒的时候要说话（⛔ 不做「拖不进去也不解释」的死角）、没被否的那张照旧放行。
 */
describe('视频具名参考槽 · 已否的产物', () => {
  it('拖一张被判「已否」的进首帧槽 —— 拒收并说出理由', () => {
    setOperatorReviewState('gen-blocked', GENERATION_REVIEW_STATE_IDS.blocked)
    render(<StudioVideoReferenceSlots selectedModel={SEEDANCE_25} />)
    dropUrl('video-slot-first', 'https://cdn.example.com/blocked.png', [
      'gen-blocked',
    ])

    expect(dispatch).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledTimes(1)
    setOperatorReviewState('gen-blocked', GENERATION_REVIEW_STATE_IDS.pending)
  })

  it('没被否的那张照旧落进槽里（⛔ 闸不是把所有拖入都拦掉）', () => {
    render(<StudioVideoReferenceSlots selectedModel={SEEDANCE_25} />)
    dropUrl('video-slot-last', 'https://cdn.example.com/ok.png', ['gen-ok'])

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
  })
})
