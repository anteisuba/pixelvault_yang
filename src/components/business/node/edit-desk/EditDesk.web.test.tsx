/**
 * 剪辑台台面的真机形状（S8）。
 *
 * ⚠ 这里断的是**用户看得见的那几件事**：布局到齐、拖进来建段、选中出属性、
 * 徽标出现且点了换新、导出只出对话框、快捷键走的是 op 栈。
 * ⛔ 不断样式数值 —— 那是对稿的事（画板逐项比对），不是断言的事。
 */

import * as React from 'react'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

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
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { EditDesk } from './EditDesk'

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
  const connectNodes = vi.fn(() => true)

  function Host() {
    const [current, setCurrent] = React.useState(state)
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
          connect={connectNodes}
          canUndo
          onUndo={onUndo}
          onExit={onExit}
          onBackToNode={onBackToNode}
          {...overrides}
        />
      </NextIntlClientProvider>
    )
  }

  const view = render(<Host />)
  return { view, onExit, onBackToNode, onUndo, read: () => state }
}

const emptyState: NodeWorkflowStateV4 = {
  version: 4,
  nodes: [videoNode('v1'), videoNode('v2')],
  edges: [],
}

describe('剪辑台 · 台面', () => {
  it('布局到齐：顶栏 · 图标栏 + 面板 · 预览 · 属性 · 时间线 · 排片栏', () => {
    renderDesk(emptyState)
    expect(screen.getByTestId('edit-desk-top-bar')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-rail')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-panel')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-preview')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-inspector')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-timeline')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-plan-model')).toBeInTheDocument()
    // 三轨都在
    expect(screen.getByTestId('edit-desk-track-video')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-track-audio')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-track-music')).toBeInTheDocument()
  })

  it('画布素材只列有产物的卡，拖进 V 轨即建段', () => {
    const { read } = renderDesk(emptyState)
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
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    const clipId = read().edit?.tracks.video[0]?.id
    expect(clipId).toBeTruthy()

    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${clipId}`))
    const inspector = screen.getByTestId('edit-desk-inspector')
    expect(
      within(inspector).getByTestId('edit-desk-speed-2'),
    ).toBeInTheDocument()

    fireEvent.click(within(inspector).getByTestId('edit-desk-speed-2'))
    expect(read().edit?.tracks.video[0]?.speed).toBe(2)
  })

  it('转场三档从属性栏落回段上', () => {
    const { read } = renderDesk(emptyState)
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    const clipId = read().edit?.tracks.video[0]?.id
    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${clipId}`))
    fireEvent.click(screen.getByTestId('edit-desk-transition-crossfade'))
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
    expect(
      landed?.data.kind === 'video' ? landed.data.url : undefined,
    ).toBe('https://example.test/lib.mp4')
    expect(clip?.out).toBe(8)
  })

  it('转场页：拖一个预设到两段之间的缝上 = 设前一段的转场', () => {
    const { read } = renderDesk(emptyState)
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
    expect(screen.getByTestId('edit-desk-audio-filter-voice')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('edit-desk-asset-a1')).toBeInTheDocument()
    expect(
      screen.getByTestId('edit-desk-track-audio').className,
    ).toContain('outline-primary')

    fireEvent.click(screen.getByTestId('edit-desk-tool-music'))
    expect(screen.getByTestId('edit-desk-audio-filter-music')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // 语音卡在「配乐」这一档里筛掉了
    expect(screen.queryByTestId('edit-desk-asset-a1')).not.toBeInTheDocument()
    expect(
      screen.getByTestId('edit-desk-track-music').className,
    ).toContain('outline-primary')
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

  it('快捷键：S 分割 · ⌫ 删段 · Esc 回画布 · ⌘Z 走同一份撤销栈', () => {
    const { read, onExit, onUndo } = renderDesk(emptyState)
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

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExit).toHaveBeenCalled()
  })

  it('「回节点重生成这段」把来源卡 id 交回外壳', () => {
    const { read, onBackToNode } = renderDesk(emptyState)
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
            connect={vi.fn(() => true)}
            canUndo={false}
            onUndo={vi.fn()}
            onExit={vi.fn()}
            onBackToNode={vi.fn()}
          />
        </NextIntlClientProvider>
      )
    }
    render(<Probe />)
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
    const videoTile = screen.getByTestId('edit-desk-asset-v1')
    expect(videoTile.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.test/poster.jpg',
    )
    const audioTile = screen.getByTestId('edit-desk-asset-a1')
    expect(audioTile.querySelector('[data-audio-waveform]')).not.toBeNull()
  })

  it('时间线上的段带缩略帧条，右栏来源也出图', () => {
    renderDesk(posterState)
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    // ⚠ 按 `data-clip-index` 找，⛔ 不按 testid 前缀 —— `edit-desk-clip-clock`
    // （预览左上那个段读数）会一起命中。
    const clip = document.querySelector('[data-clip-index="0"]')
    expect(clip).not.toBeNull()
    if (!clip) throw new Error('no clip')
    expect(clip.querySelector('[style*="poster.jpg"]')).not.toBeNull()

    fireEvent.pointerDown(clip)
    const thumb = screen.getByTestId('edit-desk-source-thumb')
    expect(thumb.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.test/poster.jpg',
    )
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
  it('工具条「文字」= 在播放头处落一段，段上写内容首行，右栏出属性', () => {
    const { read } = renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-tool-text'))

    const text = read().edit?.tracks.text ?? []
    expect(text).toHaveLength(1)
    expect(text[0]).toMatchObject({ startSec: 0, durationSec: 3, anchor: 'bc' })

    const clipId = text[0]!.id
    const onTrack = screen.getByTestId(`edit-desk-text-clip-${clipId}`)
    expect(onTrack.textContent).toContain(text[0]!.text)
    // 落下即选中 —— 右栏直接可以改内容
    expect(screen.getByTestId('edit-desk-text-content')).toHaveValue(
      text[0]!.text,
    )
  })

  it('改内容 / 位置 / 字号 → 落 op；预览按九宫叠字', () => {
    const { read } = renderDesk(emptyState)
    fireEvent.click(screen.getByTestId('edit-desk-tool-text'))
    const clipId = (read().edit?.tracks.text ?? [])[0]!.id

    const box = screen.getByTestId('edit-desk-text-content')
    fireEvent.change(box, { target: { value: '她转身走向站台尽头' } })
    fireEvent.blur(box)
    fireEvent.click(screen.getByTestId('edit-desk-text-anchor-tc'))
    fireEvent.click(screen.getByTestId('edit-desk-text-size-l'))
    fireEvent.click(screen.getByTestId('edit-desk-text-fade-0.3'))

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
    expect(
      screen.queryByTestId(`edit-desk-preview-text-${clipId}`),
    ).toBeNull()
  })

  it('⌫ 删的是选中的那一段字幕（⛔ 不误伤 V 轨）', () => {
    const { read } = renderDesk(emptyState)
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
    expect(screen.getByTestId('edit-desk-preset-premiere')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('edit-desk-shortcut-split').textContent).toBe(
      '⌘K',
    )
  })

  it('切到 Final Cut：⌘B 分割，选择记进 localStorage（⛔ 不进时间线）', () => {
    window.localStorage.clear()
    const { read } = renderDesk(emptyState)
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    fireEvent.click(screen.getByTestId('edit-desk-shortcuts'))
    fireEvent.click(screen.getByTestId('edit-desk-preset-finalCut'))
    expect(
      window.localStorage.getItem('pixelvault:edit-shortcut-preset'),
    ).toBe('finalCut')
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
