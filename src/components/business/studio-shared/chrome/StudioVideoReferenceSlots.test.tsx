// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

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
  formState.current = {
    videoFrameSlots: { first: null, last: null },
    videoReferenceVideos: [],
  }
})

function dropUrl(testId: string, url: string) {
  fireEvent.drop(screen.getByTestId(testId), {
    dataTransfer: {
      files: [],
      getData: (type: string) => (type === 'text/uri-list' ? url : ''),
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
