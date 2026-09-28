/**
 * 剪辑台台面的真机形状（S8）。
 *
 * ⚠ 这里断的是**用户看得见的那几件事**：布局到齐、拖进来建段、选中出属性、
 * 徽标出现且点了换新、导出只出对话框、快捷键走的是 op 栈。
 * ⛔ 不断样式数值 —— 那是对稿的事（画板逐项比对），不是断言的事。
 */

import * as React from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/** 素材库那一页拉的是用户自己的产物 —— 组件不 fetch，桩掉 api-client 那一条。 */
const fetchGalleryImages = vi.fn(async () => ({
  success: true as const,
  data: {
    generations: [
      {
        id: 'g_video',
        outputType: 'VIDEO',
        url: 'https://example.test/lib.mp4',
        thumbnailUrl: 'https://example.test/lib.jpg',
        duration: 8,
        prompt: '素材库里的一段',
        model: 'test',
      },
    ],
  },
}))
vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: () => fetchGalleryImages(),
}))

import messages from '@/messages/zh.json'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  EDIT_DESK_LIBRARY_DRAG_MIME,
  EDIT_DESK_NODE_DRAG_MIME,
  EDIT_DESK_TRANSITION_DRAG_MIME,
} from '@/constants/edit-desk'
import { applyNodeAssistantOpV4 } from '@/lib/node-assistant-op-apply-v4'
import type { NodeWorkflowRemoteChange } from '@/hooks/node/use-node-workflow-store'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { EditDesk } from './EditDesk'

// jsdom 没有 ResizeObserver：Radix 的滑杆（缩放 / 音量）挂载时要它。
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  }
})

const NOW = '2026-09-10T00:00:00.000Z'

function videoNode(
  id: string,
  options: {
    readonly versions?: readonly { id: string; url: string }[]
    readonly cur?: number
  } = {},
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: id,
      label: id,
      status: 'idle',
      createdAt: NOW,
      url: 'https://example.test/a.mp4',
      durationSec: 6,
      ...(options.versions
        ? {
            outputs: {
              versions: options.versions.map((version) => ({
                ...version,
                createdAt: NOW,
              })),
              cur: options.cur ?? 0,
            },
          }
        : {}),
    },
  } as NodeV4
}

function audioNode(id: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'audio',
      subtype: 'voice',
      name: id,
      status: 'idle',
      createdAt: NOW,
      url: 'https://example.test/a.mp3',
      durationSec: 4,
    },
  } as NodeV4
}

function textNode(id: string, body: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'text',
      subtype: 'script',
      name: id,
      status: 'idle',
      createdAt: NOW,
      body,
    },
  } as NodeV4
}

/** 一台**真的会落状态**的台面：dispatchBatch 走的就是 op 执行器。 */
function renderDesk(
  initial: NodeWorkflowStateV4,
  overrides: Partial<React.ComponentProps<typeof EditDesk>> = {},
) {
  let state = initial
  let counter = 0
  const onExit = vi.fn()
  const onBackToNode = vi.fn()
  const onUndo = vi.fn()
  const addNode = vi.fn()
  const setMedia = vi.fn()
  const remoteListeners = new Set<(change: NodeWorkflowRemoteChange) => void>()
  let setHostState: (next: NodeWorkflowStateV4) => void = () => undefined

  /** 外部改动换进来（store 那一步）+ 通知台面 —— 与 `NodeWorkbenchV4` 同一个顺序。 */
  const pushRemote = (after: NodeWorkflowStateV4, byClaude = true): void => {
    const before = state
    act(() => {
      state = after
      setHostState(after)
      for (const listener of remoteListeners) {
        listener({ projectId: 'proj_test', before, after, byClaude })
      }
    })
  }

  function Host() {
    const [current, setCurrent] = React.useState(state)
    React.useEffect(() => {
      setHostState = setCurrent
    }, [])
    const dispatchBatch = (ops: readonly NodeAssistantOpV4[]) => {
      let next = current
      let applied = 0
      for (const op of ops) {
        const result = applyNodeAssistantOpV4(next, op, {
          now: NOW,
          mintId: (prefix) => `${prefix}_${(counter += 1)}`,
        })
        if (result.ok) {
          next = result.state
          applied += 1
        }
      }
      state = next
      setCurrent(next)
      return { applied }
    }
    /** 真的会落到图上的建卡 / 回填 —— 素材库那条路要三步都走通才看得出来。 */
    const addNodeReal = (
      kind: NodeV4['data']['kind'],
      subtype: NodeV4['data']['subtype'],
      options?: { readonly name?: string },
    ): string => {
      const id = `n_${(counter += 1)}`
      const next: NodeWorkflowStateV4 = {
        ...current,
        nodes: [
          ...current.nodes,
          {
            id,
            position: { x: 0, y: 0 },
            data: {
              kind,
              subtype,
              name: options?.name ?? id,
              status: 'idle',
              createdAt: NOW,
            },
          } as NodeV4,
        ],
      }
      state = next
      setCurrent(next)
      addNode(kind, subtype, options)
      return id
    }
    const setMediaReal = (nodeId: string, patch: { readonly url?: string }) => {
      const next: NodeWorkflowStateV4 = {
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? ({ ...node, data: { ...node.data, ...patch } } as NodeV4)
            : node,
        ),
      }
      state = next
      setCurrent(next)
      setMedia(nodeId, patch)
    }
    return (
      <NextIntlClientProvider locale="zh" messages={messages}>
        <EditDesk
          state={current}
          projectId="proj_test"
          dispatchBatch={dispatchBatch}
          mintId={(prefix) => `${prefix}_${(counter += 1)}`}
          addNode={addNodeReal}
          setMedia={setMediaReal}
          refreshProject={vi.fn()}
          canUndo
          onUndo={onUndo}
          onExit={onExit}
          onBackToNode={onBackToNode}
          subscribeRemoteChange={(listener) => {
            remoteListeners.add(listener)
            return () => {
              remoteListeners.delete(listener)
            }
          }}
          restoreState={(target) => {
            state = target
            setCurrent(target)
          }}
          {...overrides}
        />
      </NextIntlClientProvider>
    )
  }

  const view = render(<Host />)
  return { view, onExit, onBackToNode, onUndo, pushRemote, read: () => state }
}

/** 素材面板默认收着（④ 方向 A）：要用素材格先点「画布素材」图标把它飞出来。 */
function openMaterials(): void {
  fireEvent.click(screen.getByTestId('edit-desk-panel-canvas'))
}

const emptyState: NodeWorkflowStateV4 = {
  version: 4,
  nodes: [videoNode('v1'), videoNode('v2')],
  edges: [],
}

describe('剪辑台 · 台面', () => {
  it('布局到齐：顶栏 · 图标栏 + 面板 · 预览 · 时间线（属性行在工具条上），⛔ 没有排片栏', () => {
    renderDesk(emptyState)
    expect(screen.getByTestId('edit-desk-top-bar')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-rail')).toBeInTheDocument()
    // 素材面板默认收着，点图标才飞出来。
    expect(screen.queryByTestId('edit-desk-panel')).toBeNull()
    openMaterials()
    expect(screen.getByTestId('edit-desk-panel')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-preview')).toBeInTheDocument()
    // ④ A：⛔ 没有右侧属性栏 —— 属性是时间线工具条上那一行。
    expect(
      within(screen.getByTestId('edit-desk-timeline')).getByTestId(
        'edit-desk-inspector',
      ),
    ).toBeInTheDocument()
    // ④ 方向 A：一个助手一个输入框 —— 底部排片栏已删。
    expect(screen.queryByTestId('edit-desk-plan-model')).toBeNull()
    // 三轨都在
    expect(screen.getByTestId('edit-desk-track-video')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-track-audio')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-track-music')).toBeInTheDocument()
  })

  it('画布素材只列有产物的卡，拖进 V 轨即建段', () => {
    const { read } = renderDesk(emptyState)
    openMaterials()
    expect(screen.getByTestId('edit-desk-asset-v1')).toBeInTheDocument()

    const lane = screen.getByTestId('edit-desk-track-video')
    const data = new Map<string, string>([[EDIT_DESK_NODE_DRAG_MIME, 'v1']])
    fireEvent.drop(lane, {
      dataTransfer: {
        types: [EDIT_DESK_NODE_DRAG_MIME],
        getData: (type: string) => data.get(type) ?? '',
      },
      clientX: 0,
    })

    expect(read().edit?.tracks.video).toHaveLength(1)
    expect(read().edit?.tracks.video[0]?.sourceNodeId).toBe('v1')
  })

  it('「进剪辑台」带进来的卡开台就落进 V 轨', () => {
    const { read } = renderDesk(emptyState, { initialNodeIds: ['v1', 'v2'] })
    expect(read().edit?.tracks.video).toHaveLength(2)
  })

  it('双击素材 = 追加；点段出属性；改速度落回 state', () => {
    const { read } = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    const clipId = read().edit?.tracks.video[0]?.id
    expect(clipId).toBeTruthy()

    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${clipId}`))
    const inspector = screen.getByTestId('edit-desk-inspector')
    const fast = within(inspector).getByRole('radio', { name: '2×' })
    expect(fast).toBeInTheDocument()

    fireEvent.click(fast)
    expect(read().edit?.tracks.video[0]?.speed).toBe(2)
  })

  it('转场三档从属性行落回段上', () => {
    const { read } = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    const clipId = read().edit?.tracks.video[0]?.id
    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${clipId}`))
    fireEvent.click(screen.getByRole('radio', { name: '叠化' }))
    expect(read().edit?.tracks.video[0]?.transitionOut).toBe('crossfade')
  })

  it('素材库页：拖一条产物进 V 轨 —— 先落成画布卡，段指向那张卡', async () => {
    const { read } = renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-panel-library'))
    const tile = await screen.findByTestId('edit-desk-library-tile-g_video')
    expect(tile).toBeInTheDocument()

    const payload = JSON.stringify({
      kind: 'video',
      subtype: 'clip',
      url: 'https://example.test/lib.mp4',
      name: '素材库里的一段',
      durationSec: 8,
    })
    fireEvent.drop(screen.getByTestId('edit-desk-track-video'), {
      dataTransfer: {
        types: [EDIT_DESK_LIBRARY_DRAG_MIME],
        getData: (type: string) =>
          type === EDIT_DESK_LIBRARY_DRAG_MIME ? payload : '',
      },
      clientX: 0,
    })

    await waitFor(() => expect(read().edit?.tracks.video).toHaveLength(1))
    const clip = read().edit?.tracks.video[0]
    const landed = read().nodes.find((node) => node.id === clip?.sourceNodeId)
    // 段指向的是**画布上新建的那张卡**，⛔ 不是素材库记录。
    expect(landed?.data.kind).toBe('video')
    expect(landed?.data.kind === 'video' ? landed.data.url : undefined).toBe(
      'https://example.test/lib.mp4',
    )
    expect(clip?.out).toBe(8)
  })

  it('转场页：拖一个预设到两段之间的缝上 = 设前一段的转场', () => {
    const { read } = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v2'))
    const first = read().edit?.tracks.video[0]
    expect(first?.transitionOut ?? 'none').toBe('none')

    fireEvent.click(screen.getByTestId('edit-desk-panel-transition'))
    expect(
      screen.getByTestId('edit-desk-transition-preset-crossfade'),
    ).toBeInTheDocument()

    fireEvent.drop(screen.getByTestId(`edit-desk-transition-${first?.id}`), {
      dataTransfer: {
        types: [EDIT_DESK_TRANSITION_DRAG_MIME],
        getData: (type: string) =>
          type === EDIT_DESK_TRANSITION_DRAG_MIME ? 'crossfade' : '',
      },
    })
    expect(read().edit?.tracks.video[0]?.transitionOut).toBe('crossfade')
  })

  it('工具「语音」/「配乐」：切到音频页 + 换筛 + 点亮对应轨', () => {
    renderDesk({
      version: 4,
      nodes: [videoNode('v1'), audioNode('a1')],
      edges: [],
    })

    fireEvent.click(screen.getByTestId('edit-desk-tool-voice'))
    expect(screen.getByRole('radio', { name: '语音' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByTestId('edit-desk-asset-a1')).toBeInTheDocument()
    expect(
      screen
        .getByTestId('edit-desk-track-audio')
        .querySelector('.ring-primary'),
    ).not.toBeNull()

    fireEvent.click(screen.getByTestId('edit-desk-tool-music'))
    expect(screen.getByRole('radio', { name: '配乐' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // 语音卡在「配乐」这一档里筛掉了
    expect(screen.queryByTestId('edit-desk-asset-a1')).not.toBeInTheDocument()
    expect(
      screen
        .getByTestId('edit-desk-track-music')
        .querySelector('.ring-primary'),
    ).not.toBeNull()
  })

  it('「上游已更新」徽标：出现 → 点一下换新 → 消失', () => {
    const staleState: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        videoNode('v1', {
          versions: [
            { id: 'ver1', url: 'https://example.test/a.mp4' },
            { id: 'ver2', url: 'https://example.test/b.mp4' },
          ],
          cur: 1,
        }),
      ],
      edges: [],
      edit: {
        name: '成片',
        tracks: {
          video: [
            {
              id: 'c1',
              sourceNodeId: 'v1',
              sourceVersionId: 'ver1',
              in: 0,
              out: 4,
              speed: 1,
              muted: false,
            },
          ],
          audio: [],
          music: [],
          text: [],
        },
        settings: { aspect: '16:9', resolution: '1080p', magnetic: true },
      },
    }
    const { read } = renderDesk(staleState)
    const badge = screen.getByTestId('edit-desk-stale-c1')
    fireEvent.click(badge)
    expect(read().edit?.tracks.video[0]?.sourceVersionId).toBe('ver2')
    expect(screen.queryByTestId('edit-desk-stale-c1')).not.toBeInTheDocument()
  })

  it('磁吸开关落进 settings', () => {
    const { read } = renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-magnetic'))
    expect(read().edit?.settings.magnetic).toBe(false)
  })

  it('时间线缩放：放大变宽、「铺满」回到默认；按住标尺拖 = 拖播放头', () => {
    renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    const canvas = screen.getByTestId('edit-desk-timeline-scroll')
      .firstElementChild as HTMLElement
    const fitWidth = parseFloat(canvas.style.width)

    fireEvent.click(screen.getByTestId('edit-desk-zoom-in'))
    fireEvent.click(screen.getByTestId('edit-desk-zoom-in'))
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(fitWidth)
    expect(screen.getByTestId('edit-desk-zoom-fit')).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    fireEvent.click(screen.getByTestId('edit-desk-zoom-fit'))
    expect(parseFloat(canvas.style.width)).toBe(fitWidth)

    // 标尺上按下即落播放头（拖动的每一帧走同一条路）
    fireEvent.pointerDown(screen.getByTestId('edit-desk-ruler'), {
      clientX: 80,
    })
    expect(screen.getByTestId('edit-desk-playhead').style.left).toBe('80px')
  })

  it('导出只出对话框，点确认不发请求（S9 占位）', () => {
    renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-export'))
    const dialog = screen.getByTestId('edit-desk-export-dialog')
    expect(
      within(dialog).getByTestId('edit-desk-export-range-all'),
    ).toBeInTheDocument()
    // 没标 I/O、没选段 → 那两档不能选
    expect(
      within(dialog).getByTestId('edit-desk-export-range-inOut'),
    ).toBeDisabled()
    expect(
      within(dialog).getByTestId('edit-desk-export-range-clip'),
    ).toBeDisabled()
    expect(
      within(dialog).getByTestId('edit-desk-export-to-canvas'),
    ).toBeChecked()
  })

  it('快捷键：S 分割 · ⌫ 删段 · Esc 回画布 · ⌘Z 走同一份撤销栈', async () => {
    const { read, onExit, onUndo } = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    const clipId = read().edit?.tracks.video[0]?.id
    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${clipId}`))

    // 播放头在 0 处切不动（切出来的前半段是零帧）—— 先挪到段中间
    fireEvent.pointerDown(screen.getByTestId('edit-desk-track-video'), {
      clientX: 120,
    })
    fireEvent.keyDown(window, { key: 's' })
    expect(read().edit?.tracks.video.length).toBeGreaterThan(1)

    fireEvent.keyDown(window, { key: 'Backspace' })
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(onUndo).toHaveBeenCalled()

    // 点段那一下已经把素材面板收了（点别处收回）。重新飞出来，验 Esc 梯：
    // 先收飞出来的素材面板，再回画布。
    openMaterials()
    fireEvent.keyDown(window, { key: 'Escape' })
    // 收回有一段退场动效，等它走完。
    await waitFor(() =>
      expect(screen.queryByTestId('edit-desk-panel')).toBeNull(),
    )
    expect(onExit).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExit).toHaveBeenCalled()
  })

  it('「回节点」把来源卡 id 交回外壳', () => {
    const { read, onBackToNode } = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    const clipId = read().edit?.tracks.video[0]?.id
    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${clipId}`))
    fireEvent.click(screen.getByTestId('edit-desk-back-to-node'))
    expect(onBackToNode).toHaveBeenCalledWith('v1')
  })

  it('第一次落段时同批先播一份带名字的空表（撤销一步回到位）', () => {
    const ops: NodeAssistantOpV4[][] = []
    function Probe() {
      return (
        <NextIntlClientProvider locale="zh" messages={messages}>
          <EditDesk
            state={emptyState}
            projectId="proj_test"
            dispatchBatch={(batch) => {
              ops.push([...batch])
              return { applied: batch.length }
            }}
            mintId={(prefix) => `${prefix}_1`}
            addNode={vi.fn(() => 'n_new')}
            setMedia={vi.fn()}
            refreshProject={vi.fn()}
            canUndo={false}
            onUndo={vi.fn()}
            onExit={vi.fn()}
            onBackToNode={vi.fn()}
          />
        </NextIntlClientProvider>
      )
    }
    render(<Probe />)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    expect(ops).toHaveLength(1)
    expect(ops[0]?.[0]?.op).toBe(NODE_ASSISTANT_OP_V4_IDS.editSetTimeline)
    expect(ops[0]?.[1]?.op).toBe(NODE_ASSISTANT_OP_V4_IDS.editAddClip)
  })
})

/**
 * 每一格都看得见内容（S8b · owner 真机 2026-09-10「左栏没有预览图」）。
 *
 * ⚠ 断的是**有没有东西可看**，⛔ 不断哪一条地址 —— 封面三级来路（卡自带缩略 /
 * 边缘抽帧 / 客户端抓首帧）里只有第一级在 jsdom 里跑得动，另两级要网络与解码。
 */
describe('剪辑台 · 素材与段的长相', () => {
  const posterState: NodeWorkflowStateV4 = {
    version: 4,
    nodes: [
      {
        ...videoNode('v1'),
        data: {
          ...videoNode('v1').data,
          videoThumbnailUrl: 'https://example.test/poster.jpg',
        },
      } as NodeV4,
      audioNode('a1'),
      textNode('t1', '外景 · 车站\n第二行不该出现'),
    ],
    edges: [],
  }

  it('视频素材格出封面图，音频素材格出波形', () => {
    renderDesk(posterState)
    openMaterials()
    const videoTile = screen.getByTestId('edit-desk-asset-v1')
    expect(videoTile.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.test/poster.jpg',
    )
    const audioTile = screen.getByTestId('edit-desk-asset-a1')
    expect(audioTile.querySelector('[data-audio-waveform]')).not.toBeNull()
  })

  it('时间线上的段带缩略帧条', () => {
    renderDesk(posterState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    // ⚠ 按 `data-clip-index` 找，⛔ 不按 testid 前缀 —— `edit-desk-clip-clock`
    // （预览左上那个段读数）会一起命中。
    const clip = document.querySelector('[data-clip-index="0"]')
    expect(clip).not.toBeNull()
    if (!clip) throw new Error('no clip')
    expect(clip.querySelector('[style*="poster.jpg"]')).not.toBeNull()
  })

  it('「文字」页列文本卡的首行', () => {
    renderDesk(posterState)
    fireEvent.click(screen.getByTestId('edit-desk-panel-text'))
    const row = screen.getByTestId('edit-desk-text-t1')
    expect(within(row).getByText('外景 · 车站')).toBeInTheDocument()
    expect(within(row).queryByText('第二行不该出现')).toBeNull()
  })
})

/* ─── 文字段与快捷键预设（S8d · spec §6，画板 `EditDeskText.dc.html`）───── */

describe('剪辑台 · 文字段', () => {
  it('工具条「文字」= 在播放头处落一段，段上写内容首行，属性行换成字幕', () => {
    const { read } = renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-tool-text'))

    const text = read().edit?.tracks.text ?? []
    expect(text).toHaveLength(1)
    expect(text[0]).toMatchObject({ startSec: 0, durationSec: 3, anchor: 'bc' })

    const clipId = text[0]!.id
    const onTrack = screen.getByTestId(`edit-desk-text-clip-${clipId}`)
    expect(onTrack.textContent).toContain(text[0]!.text)
    // 落下即选中 —— 那一行换成字幕的属性，行首是字
    expect(screen.getByTestId('edit-desk-text-edit').textContent).toContain(
      text[0]!.text,
    )
  })

  it('预览上双击字幕原地改字（Enter 确认）；四颗小按钮改位置 / 字号 / 淡入淡出', () => {
    const { read } = renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-tool-text'))
    const clipId = (read().edit?.tracks.text ?? [])[0]!.id

    fireEvent.doubleClick(
      screen.getByTestId(`edit-desk-preview-text-${clipId}`),
    )
    const box = screen.getByTestId(`edit-desk-preview-text-editing-${clipId}`)
    box.textContent = '她转身走向站台尽头'
    fireEvent.keyDown(box, { key: 'Enter' })

    fireEvent.click(screen.getByTestId('edit-desk-text-anchor-trigger'))
    fireEvent.click(screen.getByTestId('edit-desk-text-anchor-tc'))
    fireEvent.click(screen.getByTestId('edit-desk-text-size-trigger'))
    fireEvent.click(screen.getByRole('radio', { name: '大' }))
    fireEvent.click(screen.getByTestId('edit-desk-text-fade-trigger'))
    fireEvent.click(screen.getByRole('radio', { name: '0.3s' }))

    expect((read().edit?.tracks.text ?? [])[0]).toMatchObject({
      text: '她转身走向站台尽头',
      anchor: 'tc',
      size: 'l',
      fadeSec: 0.3,
    })

    // 播放头在 0，段是 0–3 → 预览上叠着这一句
    const overlay = screen.getByTestId(`edit-desk-preview-text-${clipId}`)
    expect(overlay.textContent).toBe('她转身走向站台尽头')
  })

  it('Esc 放弃改字：原文不变，⛔ 不退出剪辑台；空字不收', () => {
    const { read, onExit } = renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-tool-text'))
    const original = (read().edit?.tracks.text ?? [])[0]!
    const clipId = original.id

    fireEvent.doubleClick(
      screen.getByTestId(`edit-desk-preview-text-${clipId}`),
    )
    let box = screen.getByTestId(`edit-desk-preview-text-editing-${clipId}`)
    box.textContent = '不要这句'
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(onExit).not.toHaveBeenCalled()
    expect((read().edit?.tracks.text ?? [])[0]?.text).toBe(original.text)
    expect(
      screen.queryByTestId(`edit-desk-preview-text-editing-${clipId}`),
    ).toBeNull()

    // 行首那颗字也能进；清空后点别处 = 回到原文
    fireEvent.click(screen.getByTestId('edit-desk-text-edit'))
    box = screen.getByTestId(`edit-desk-preview-text-editing-${clipId}`)
    box.textContent = '   '
    fireEvent.blur(box)
    expect((read().edit?.tracks.text ?? [])[0]?.text).toBe(original.text)
  })

  it('别人已经接过的 Esc（弹层 / 对话框关自己）⛔ 不再退出剪辑台', () => {
    const { onExit } = renderDesk(emptyState)
    // Radix 的层在捕获阶段关掉自己并 `preventDefault` —— 这里照样做一遍。
    const layer = (event: KeyboardEvent) => event.preventDefault()
    document.addEventListener('keydown', layer, { capture: true })
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' })
    } finally {
      document.removeEventListener('keydown', layer, { capture: true })
    }
    expect(onExit).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onExit).toHaveBeenCalled()
  })

  it('播放头走出段外就不显示（⛔ 不留一句一直挂着的字幕）', () => {
    const { read } = renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-tool-text'))
    const clipId = (read().edit?.tracks.text ?? [])[0]!.id
    expect(
      screen.queryByTestId(`edit-desk-preview-text-${clipId}`),
    ).toBeInTheDocument()

    // 时间线只有这一段字幕（总长 3s）—— 把播放头拖到末尾之后
    fireEvent.pointerDown(screen.getByTestId('edit-desk-track-text'), {
      clientX: 10_000,
    })
    expect(screen.queryByTestId(`edit-desk-preview-text-${clipId}`)).toBeNull()
  })

  it('⌫ 删的是选中的那一段字幕（⛔ 不误伤 V 轨）', () => {
    const { read } = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    fireEvent.click(screen.getByTestId('edit-desk-tool-text'))
    expect(read().edit?.tracks.text).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(read().edit?.tracks.text).toHaveLength(0)
    expect(read().edit?.tracks.video).toHaveLength(1)
  })
})

describe('剪辑台 · 快捷键预设', () => {
  it('弹层给二选一 + 当前预设的只读键位表', () => {
    renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-shortcuts'))
    expect(screen.getByRole('radio', { name: 'Premiere' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByTestId('edit-desk-shortcut-split').textContent).toBe(
      '⌘K',
    )
  })

  it('切到 Final Cut：⌘B 分割，选择记进 localStorage（⛔ 不进时间线）', () => {
    window.localStorage.clear()
    const { read } = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    fireEvent.click(screen.getByTestId('edit-desk-shortcuts'))
    fireEvent.click(screen.getByRole('radio', { name: 'Final Cut' }))
    expect(window.localStorage.getItem('pixelvault:edit-shortcut-preset')).toBe(
      'finalCut',
    )
    expect(screen.getByTestId('edit-desk-shortcut-split').textContent).toBe(
      '⌘B',
    )
    fireEvent.keyDown(window, { key: 'Escape' })

    // 播放头挪到段中间再切
    fireEvent.pointerDown(screen.getByTestId('edit-desk-track-video'), {
      clientX: 120,
    })
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB', metaKey: true })
    expect(read().edit?.tracks.video.length).toBeGreaterThan(1)
    // 时间线数据里没有预设这回事
    expect(JSON.stringify(read().edit)).not.toContain('finalCut')
  })
})

/* ─── 回执与段闪（④ A 关键切片 · node-canvas-v2 §6）──────────────────── */

describe('剪辑台 · 回执与段闪', () => {
  /** 把 V 轨第一段的速度改掉 —— 一次「外部 Claude 改了 1 段」。 */
  function withFirstClipSpeed(
    current: NodeWorkflowStateV4,
    speed: number,
  ): NodeWorkflowStateV4 {
    const edit = current.edit
    if (!edit) throw new Error('no timeline')
    const [first, ...rest] = edit.tracks.video
    if (!first) throw new Error('no clip')
    return {
      ...current,
      edit: {
        ...edit,
        tracks: { ...edit.tracks, video: [{ ...first, speed }, ...rest] },
      },
    }
  }

  function withOneClip() {
    const desk = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    return desk
  }

  it('Claude 改了一段 → 舞台上方一条回执，连着改数字累加；撤销退回这一条里的全部', async () => {
    const { pushRemote, read } = withOneClip()
    const original = read()
    const clipId = original.edit?.tracks.video[0]?.id

    pushRemote(withFirstClipSpeed(read(), 2))
    expect(screen.getByTestId('edit-desk-receipt-text').textContent).toBe(
      'Claude 改了 1 段',
    )
    // 改到的段闪一下（下一帧挂上 class）
    await waitFor(() =>
      expect(
        screen.getByTestId(`edit-desk-clip-${clipId}`).className,
      ).toContain('edit-clip-touched'),
    )

    pushRemote(withFirstClipSpeed(read(), 0.5))
    expect(screen.getByTestId('edit-desk-receipt-text').textContent).toBe(
      'Claude 改了 2 段',
    )

    fireEvent.click(screen.getByTestId('edit-desk-receipt-action'))
    expect(read()).toBe(original)
    expect(screen.getByTestId('edit-desk-receipt-text').textContent).toBe(
      '已撤销',
    )
  })

  it('你自己又改了一笔 → 那条回执收起（⛔ 留一颗会把你的改动一起退掉的撤销）', async () => {
    const { pushRemote, read } = withOneClip()
    const clipId = read().edit?.tracks.video[0]?.id
    pushRemote(withFirstClipSpeed(read(), 2))
    expect(screen.getByTestId('edit-desk-receipt')).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${clipId}`))
    fireEvent.click(screen.getByRole('radio', { name: '叠化' }))
    await waitFor(() =>
      expect(screen.queryByTestId('edit-desk-receipt')).toBeNull(),
    )
  })

  it('不是 Claude（同账号另一个标签页）→ 只跟上，不出回执', () => {
    const { pushRemote, read } = withOneClip()
    pushRemote(withFirstClipSpeed(read(), 2), false)
    expect(screen.queryByTestId('edit-desk-receipt')).toBeNull()
  })

  it('Claude 导出的成片落卡 →「看看」回画布并选中那张卡', () => {
    const { pushRemote, read, onBackToNode } = renderDesk(emptyState)
    const landed = {
      ...videoNode('render_1'),
      data: {
        ...videoNode('render_1').data,
        outputs: {
          versions: [
            {
              id: 'ov_render',
              url: 'https://example.test/cut.mp4',
              createdAt: NOW,
              generationId: 'gen_claude',
              source: { kind: 'render', label: '来自剪辑台 · 成片' },
            },
          ],
          cur: 0,
        },
      },
    } as NodeV4
    pushRemote({ ...read(), nodes: [...read().nodes, landed] })

    expect(screen.getByTestId('edit-desk-receipt-text').textContent).toBe(
      'Claude 导出了成片 · 已落到画布',
    )
    fireEvent.click(screen.getByTestId('edit-desk-receipt-action'))
    expect(onBackToNode).toHaveBeenCalledWith('render_1')
  })
})
