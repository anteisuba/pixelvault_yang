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
/**
 * 重拍栏本身是画布卡那条提示词栏（要整套画布上下文，视频卡那组测试已测）。这里桩成两颗
 * 键，只看台面这一侧：发起 → 段上生成中 → 落版自动换上 / 失败描红。
 */
vi.mock('./EditDeskRetakeBar', () => ({
  EditDeskRetakeBar: ({
    desk,
    row,
    track,
  }: {
    readonly desk: import('@/hooks/node/use-edit-desk').EditDesk
    readonly row: import('@/lib/edit-project').EditTimelineRow
    readonly track: import('@/constants/edit-desk').EditTrackId
  }) => (
    <div data-testid="retake-bar-stub" data-clip={row.clip.id}>
      <button
        type="button"
        data-testid="retake-bar-send"
        onClick={() => {
          desk.beginRetake(track, row.clip.id)
          desk.closeRetake()
        }}
      />
      <button
        type="button"
        data-testid="retake-bar-blocked"
        onClick={() => {
          desk.beginRetake(track, row.clip.id)
          desk.closeRetake()
          desk.settleRetake(row.clip.id, { status: 'notSent' })
        }}
      />
    </div>
  ),
}))
/** 版本弹层会去量每一版多长 —— jsdom 里 `<video>` 不出元数据，直接答「量不出来」。 */
const probeDuration = vi.fn(async (): Promise<number | null> => null)
vi.mock('@/lib/media-probe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media-probe')>()),
  probeMediaDuration: () => probeDuration(),
}))

/**
 * 续拍那一批（截末帧 + 建卡 + 连线）是画布卡同一个动作，视频卡那组测试已测。这里只看
 * 剪辑台托它带上的那一段占位：插在哪、截到哪一秒、之后栏升在哪一段上。
 */
const continueVideo = vi.fn<
  (
    input: import('../nodes/v4/video/use-video-continue').VideoContinueInput,
  ) => Promise<{ shotId: string } | null>
>(async () => ({ shotId: 'shot_new' }))
vi.mock('../nodes/v4/video/use-video-continue', () => ({
  VIDEO_CONTINUE_REFS: { tail: 'tail', shot: 'shot' },
  useVideoContinue: () => continueVideo,
}))
vi.mock('@/hooks/node/use-video-reference-slots', () => ({
  useVideoReferenceSlots: () => ({
    grabbing: null,
    uploadError: null,
    captureLastFrame: vi.fn(),
    captureCurrentFrame: vi.fn(),
  }),
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
    readonly url?: string
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
      url: options.url ?? 'https://example.test/a.mp4',
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

/** 加字幕在左列「文字」页顶上（v2 第 3 片：时间线上那排工具键去掉了）。 */
function addCaption(): void {
  fireEvent.click(screen.getByTestId('edit-desk-panel-text'))
  fireEvent.click(screen.getByTestId('edit-desk-add-caption'))
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
    // 速度是一颗小胶囊，点开才是三档
    fireEvent.click(within(inspector).getByTestId('edit-desk-speed-trigger'))
    fireEvent.click(screen.getByRole('radio', { name: '2×' }))
    expect(read().edit?.tracks.video[0]?.speed).toBe(2)
  })

  it('主线段平时只有画面，名字只在选中（或悬停）时出来（换皮第一轮 B）', () => {
    renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v2'))
    const [first, second] = screen
      .getAllByTestId(/^edit-desk-clip-name-/)
      .map((element) =>
        element.dataset.testid?.replace('edit-desk-clip-name-', ''),
      )
    expect(screen.getByTestId(`edit-desk-clip-name-${first}`)).toHaveClass(
      'opacity-0',
    )
    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${first}`))
    expect(screen.getByTestId(`edit-desk-clip-name-${first}`)).toHaveClass(
      'opacity-100',
    )
    expect(screen.getByTestId(`edit-desk-clip-name-${second}`)).toHaveClass(
      'opacity-0',
    )
  })

  it('转场三档从属性行落回段上', () => {
    const { read } = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    const clipId = read().edit?.tracks.video[0]?.id
    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${clipId}`))
    fireEvent.click(screen.getByTestId('edit-desk-transition-trigger'))
    fireEvent.click(screen.getByRole('radio', { name: '叠化' }))
    expect(read().edit?.tracks.video[0]?.transitionOut).toBe('crossfade')
  })

  it('走带行：播放键与空格同一份播放态；声音键让预览静音；分割 / 删除两颗小键', () => {
    // jsdom 的 <video> 不会播：`play()` 给一个立即兑现的 promise 就够了。
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { read } = renderDesk(emptyState, { initialNodeIds: ['v1'] })
    const play = screen.getByTestId('edit-desk-play')
    expect(play).toHaveAttribute('aria-label', '播放')
    fireEvent.click(play)
    expect(play).toHaveAttribute('aria-label', '暂停')

    const video = screen.getByTestId(
      'edit-desk-preview-video',
    ) as HTMLVideoElement
    expect(video.muted).toBe(false)
    fireEvent.click(screen.getByTestId('edit-desk-mute'))
    expect(video.muted).toBe(true)

    // 没选中时没有那两颗键；选中一段才出
    expect(screen.queryByTestId('edit-desk-remove')).toBeNull()
    const clipId = read().edit?.tracks.video[0]?.id
    fireEvent.pointerDown(screen.getByTestId(`edit-desk-clip-${clipId}`))
    fireEvent.click(screen.getByTestId('edit-desk-remove'))
    expect(read().edit?.tracks.video).toHaveLength(0)
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

  it('只看不剪（手机档）：走带行只留播放 · 时间码 · 声音，轨道整块 inert', () => {
    renderDesk(emptyState, { initialNodeIds: ['v1'], readOnly: true })
    expect(screen.getByTestId('edit-desk-play')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-mute')).toBeInTheDocument()
    expect(screen.queryByTestId('edit-desk-inspector')).toBeNull()
    expect(screen.queryByTestId('edit-desk-zoom-fit')).toBeNull()
    expect(screen.queryByTestId('edit-desk-rail')).toBeNull()
    const lanes = screen
      .getByTestId('edit-desk-timeline')
      .querySelector('[data-edit-desk-readonly="true"]')
    expect(lanes).toHaveAttribute('inert')
    // 播放键不在 inert 那一块里
    expect(lanes?.contains(screen.getByTestId('edit-desk-play'))).toBe(false)
  })

  it('音频页的三档筛：语音 / 配乐各只列自己那一类', () => {
    renderDesk({
      version: 4,
      nodes: [videoNode('v1'), audioNode('a1')],
      edges: [],
    })

    fireEvent.click(screen.getByTestId('edit-desk-panel-audio'))
    fireEvent.click(screen.getByRole('radio', { name: '语音' }))
    expect(screen.getByTestId('edit-desk-asset-a1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '配乐' }))
    // 语音卡在「配乐」这一档里筛掉了
    expect(screen.queryByTestId('edit-desk-asset-a1')).not.toBeInTheDocument()
  })

  it('段播自己钉住的那一版；画布换了版只亮一个点，在版本弹层里换（4a）', async () => {
    const pinnedState: NodeWorkflowStateV4 = {
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
        settings: { aspect: '16:9', resolution: '1080p' },
      },
    }
    const { read } = renderDesk(pinnedState)
    const sources = () =>
      [...document.querySelectorAll('video')].map((video) =>
        video.getAttribute('src'),
      )
    // 卡的当前版是 b，段钉的是 a：预览播 a
    expect(sources()).toContain('https://example.test/a.mp4')
    expect(sources()).not.toContain('https://example.test/b.mp4')

    const badge = screen.getByTestId('edit-desk-takes-c1')
    expect(badge).toHaveTextContent('1/2')
    expect(badge).toHaveAccessibleName('版本 1/2 · 画布上换了新版')

    fireEvent.click(badge)
    expect(screen.getByTestId('edit-desk-versions')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-version-1')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByTestId('edit-desk-version-2')).toHaveTextContent(
      '画布 · 新',
    )

    // 点下去对勾立刻挪过去，弹层停一会儿再收（换皮第二轮）
    fireEvent.click(screen.getByTestId('edit-desk-version-2'))
    expect(read().edit?.tracks.video[0]?.sourceVersionId).toBe('ver2')
    expect(screen.getByTestId('edit-desk-version-2')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByTestId('edit-desk-takes-c1')).toHaveAccessibleName(
      '版本 2/2',
    )
    await waitFor(() =>
      expect(screen.queryByTestId('edit-desk-versions')).toBeNull(),
    )

    // 挑回旧版：卡也跟着切回去，⛔ 不留一个关不掉的「有新版」点
    fireEvent.click(screen.getByTestId('edit-desk-takes-c1'))
    fireEvent.click(screen.getByTestId('edit-desk-version-1'))
    const after = read()
    expect(after.edit?.tracks.video[0]?.sourceVersionId).toBe('ver1')
    const node = after.nodes.find((item) => item.id === 'v1')
    expect(node?.data.kind === 'video' ? node.data.outputs?.cur : null).toBe(0)
    expect(screen.getByTestId('edit-desk-takes-c1')).toHaveAccessibleName(
      '版本 1/2',
    )
  })

  it('版本弹层里停在另一版上：大预览左右对比，停回在用那版 / 关上弹层就收（换皮第二轮 W）', async () => {
    const twoTakes: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        videoNode('v1', {
          versions: [
            { id: 'ver1', url: 'https://example.test/a.mp4' },
            { id: 'ver2', url: 'https://example.test/b.mp4' },
          ],
          cur: 0,
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
        settings: { aspect: '16:9', resolution: '1080p' },
      },
    }
    const { read } = renderDesk(twoTakes)
    expect(screen.queryByTestId('edit-desk-take-compare')).toBeNull()

    fireEvent.click(screen.getByTestId('edit-desk-takes-c1'))
    fireEvent.pointerEnter(screen.getByTestId('edit-desk-version-2'))
    const compare = screen.getByTestId('edit-desk-take-compare')
    expect(compare).toHaveAttribute('aria-hidden', 'false')
    expect(
      screen.getByTestId('edit-desk-take-compare-label'),
    ).toHaveTextContent('第 2 版')
    const compareSources = [...compare.querySelectorAll('video')].map((video) =>
      video.getAttribute('src'),
    )
    expect(compareSources).toEqual([
      'https://example.test/a.mp4',
      'https://example.test/b.mp4',
    ])
    // 只是看：时间线不动
    expect(read().edit?.tracks.video[0]?.sourceVersionId).toBe('ver1')

    // 拖分隔线不算点在弹层外面：弹层不收、对比还在
    const handle = screen.getByTestId('edit-desk-take-compare-handle')
    fireEvent.pointerDown(handle, { clientX: 10, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 10, pointerId: 1 })
    expect(screen.getByTestId('edit-desk-versions')).toBeInTheDocument()
    expect(compare).toHaveAttribute('aria-hidden', 'false')

    // 停回在用那一版 = 不比
    fireEvent.pointerEnter(screen.getByTestId('edit-desk-version-1'))
    expect(compare).toHaveAttribute('aria-hidden', 'true')

    fireEvent.pointerEnter(screen.getByTestId('edit-desk-version-2'))
    expect(compare).toHaveAttribute('aria-hidden', 'false')
    // 弹层的防误关只挡焦点刚进来的那一拍：真人点两下之间早过了这一拍。
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    fireEvent.click(screen.getByTestId('edit-desk-takes-c1'))
    await waitFor(() =>
      expect(screen.queryByTestId('edit-desk-versions')).toBeNull(),
    )
    expect(compare).toHaveAttribute('aria-hidden', 'true')
  })

  it('就地重拍：升起栏 → 段上生成中 → 新版落到卡上就自动换上；失败描红点开再改（4b）', async () => {
    const take = (id: string, url: string) => ({ id, url, createdAt: NOW })
    const base: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        videoNode('v1', {
          versions: [{ id: 'ver1', url: 'https://example.test/a.mp4' }],
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
        settings: { aspect: '16:9', resolution: '1080p' },
      },
    }
    const { read, pushRemote } = renderDesk(base)
    fireEvent.pointerDown(screen.getByTestId('edit-desk-clip-c1'))

    // 选中行「重拍」升起栏；Esc 先收栏，⛔ 不退出剪辑台
    fireEvent.click(screen.getByTestId('edit-desk-retake'))
    expect(screen.getByTestId('retake-bar-stub')).toHaveAttribute(
      'data-clip',
      'c1',
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByTestId('retake-bar-stub')).not.toBeInTheDocument(),
    )

    // 没发出去（发送前校验拦下）：段上什么都不留
    fireEvent.click(screen.getByTestId('edit-desk-retake'))
    fireEvent.click(screen.getByTestId('retake-bar-blocked'))
    expect(
      screen.queryByTestId('edit-desk-retaking-c1'),
    ).not.toBeInTheDocument()

    // 发出去：栏收起，段上生成中，预览左上写第 2 版
    fireEvent.click(screen.getByTestId('edit-desk-retake'))
    fireEvent.click(screen.getByTestId('retake-bar-send'))
    expect(screen.getByTestId('edit-desk-retaking-c1')).toBeInTheDocument()
    expect(
      screen.getByTestId('edit-desk-preview-generating'),
    ).toHaveTextContent('第 2 版生成中')

    // 新版落到卡上 → 段自动换上
    const landed = read()
    pushRemote(
      {
        ...landed,
        nodes: landed.nodes.map((node) =>
          node.id === 'v1' && node.data.kind === 'video'
            ? ({
                ...node,
                data: {
                  ...node.data,
                  outputs: {
                    versions: [
                      take('ver1', 'https://example.test/a.mp4'),
                      take('ver2', 'https://example.test/b.mp4'),
                    ],
                    cur: 1,
                  },
                },
              } as NodeV4)
            : node,
        ),
      },
      false,
    )
    await waitFor(() =>
      expect(read().edit?.tracks.video[0]?.sourceVersionId).toBe('ver2'),
    )
    expect(
      screen.queryByTestId('edit-desk-retaking-c1'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-takes-c1')).toHaveTextContent('2/2')

    // 再拍一次，这回失败：段描红、角上「!」，点它 = 再升起这一段的栏
    fireEvent.click(screen.getByTestId('edit-desk-retake'))
    fireEvent.click(screen.getByTestId('retake-bar-send'))
    const before = read()
    pushRemote(
      {
        ...before,
        nodes: before.nodes.map((node) =>
          node.id === 'v1'
            ? ({
                ...node,
                data: {
                  ...node.data,
                  status: 'failed',
                  generationFailure: { error: 'moderation' },
                },
              } as NodeV4)
            : node,
        ),
      },
      false,
    )
    const flag = await screen.findByTestId('edit-desk-retake-failed-c1')
    expect(screen.queryByTestId('edit-desk-takes-c1')).not.toBeInTheDocument()
    fireEvent.click(flag)
    expect(screen.getByTestId('retake-bar-stub')).toHaveAttribute(
      'data-clip',
      'c1',
    )
  })

  it('续拍：段后插一段占位、栏升在占位上；新版落下来占位按新版整段换成真段（4c）', async () => {
    const take = (id: string, url: string) => ({ id, url, createdAt: NOW })
    const base: NodeWorkflowStateV4 = {
      version: 4,
      nodes: [
        videoNode('v1', {
          versions: [{ id: 'ver1', url: 'https://example.test/a.mp4' }],
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
              in: 0.5,
              out: 3.5,
              speed: 1,
              muted: false,
            },
          ],
          audio: [],
          music: [],
          text: [],
        },
        settings: { aspect: '16:9', resolution: '1080p' },
      },
    }
    const { read, pushRemote } = renderDesk(base)
    fireEvent.pointerDown(screen.getByTestId('edit-desk-clip-c1'))
    fireEvent.click(screen.getByTestId('edit-desk-continue'))
    await waitFor(() => expect(continueVideo).toHaveBeenCalled())

    // 末帧截在段的出点（⛔ 不是整版片尾），占位插在这一段后面、来源是同一批新建的卡
    const input = continueVideo.mock.calls[0]![0]
    expect(input).toMatchObject({
      nodeId: 'v1',
      url: 'https://example.test/a.mp4',
      untilSec: 3.5,
    })
    const added = input.then?.[0]
    expect(added).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.editAddClip,
      track: 'video',
      index: 1,
      clip: { sourceNodeId: 'shot', in: 0 },
    })
    if (added?.op !== NODE_ASSISTANT_OP_V4_IDS.editAddClip) {
      throw new Error('续拍没有带上占位段')
    }
    const placeholder = added.clip

    // 那一批落下来（桩里不落，这里照它落）：栏升在占位段上，段上写「待生成」
    const after = read()
    pushRemote(
      {
        ...after,
        nodes: [...after.nodes, videoNode('shot_new', { url: '' })].map(
          (node) =>
            node.id === 'shot_new'
              ? ({ ...node, data: { ...node.data, url: undefined } } as NodeV4)
              : node,
        ),
        edit: {
          ...after.edit!,
          tracks: {
            ...after.edit!.tracks,
            video: [
              ...after.edit!.tracks.video,
              { ...placeholder, sourceNodeId: 'shot_new' },
            ],
          },
        },
      },
      false,
    )
    await waitFor(() =>
      expect(screen.getByTestId('retake-bar-stub')).toHaveAttribute(
        'data-clip',
        placeholder.id,
      ),
    )
    expect(
      screen.getByTestId(`edit-desk-pending-${placeholder.id}`),
    ).toBeInTheDocument()

    // 在占位上发一枪 → 新版 8 秒落到卡上 → 占位按新版整段换成真段
    probeDuration.mockResolvedValue(8)
    fireEvent.click(screen.getByTestId('retake-bar-send'))
    const sent = read()
    pushRemote(
      {
        ...sent,
        nodes: sent.nodes.map((node) =>
          node.id === 'shot_new' && node.data.kind === 'video'
            ? ({
                ...node,
                data: {
                  ...node.data,
                  url: 'https://example.test/next.mp4',
                  outputs: {
                    versions: [take('nv1', 'https://example.test/next.mp4')],
                    cur: 0,
                  },
                },
              } as NodeV4)
            : node,
        ),
      },
      false,
    )
    await waitFor(() =>
      expect(read().edit?.tracks.video[1]).toMatchObject({
        id: placeholder.id,
        sourceVersionId: 'nv1',
        out: 8,
      }),
    )
    expect(
      screen.queryByTestId(`edit-desk-pending-${placeholder.id}`),
    ).not.toBeInTheDocument()
    probeDuration.mockResolvedValue(null)
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

  it('预览把前后段一起挂好：同源的段共用一只 <video>，只有播放头那只可见', () => {
    const shared = renderDesk(emptyState, { initialNodeIds: ['v1', 'v2'] })
    expect(
      screen.getByTestId('edit-desk-preview').querySelectorAll('video'),
    ).toHaveLength(1)
    shared.view.unmount()

    renderDesk(
      {
        ...emptyState,
        nodes: [
          videoNode('v1'),
          videoNode('v2', { url: 'https://example.test/b.mp4' }),
        ],
      },
      { initialNodeIds: ['v1', 'v2'] },
    )
    const videos = screen
      .getByTestId('edit-desk-preview')
      .querySelectorAll('video')
    expect(videos).toHaveLength(2)
    const active = screen.getByTestId('edit-desk-preview-video')
    expect(active.getAttribute('src')).toBe('https://example.test/a.mp4')
    expect(active).toHaveClass('opacity-100')
    const next = [...videos].find((video) => video !== active)
    expect(next).toHaveClass('opacity-0')
    expect(next).toHaveAttribute('preload', 'auto')
  })

  it('停着时画面 seek 落地 ⛔ 不回写播放头（否则两个位置来回跳）', () => {
    renderDesk(emptyState, { initialNodeIds: ['v1'] })
    const before = screen.getByTestId('edit-desk-playhead').style.left
    const video = screen.getByTestId('edit-desk-preview-video')
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 3,
    })
    fireEvent(video, new Event('timeupdate'))
    expect(screen.getByTestId('edit-desk-playhead').style.left).toBe(before)
  })

  it('点轨道空白 = 取消选中（⛔ 不再挪播放头）', () => {
    const { read } = renderDesk(emptyState, { initialNodeIds: ['v1'] })
    const clipId = read().edit?.tracks.video[0]?.id
    const clip = screen.getByTestId(`edit-desk-clip-${clipId}`)
    fireEvent.pointerDown(clip)
    expect(clip).toHaveAttribute('aria-pressed', 'true')

    const before = screen.getByTestId('edit-desk-playhead').style.left
    fireEvent.pointerDown(screen.getByTestId('edit-desk-track-video'), {
      clientX: 300,
    })
    expect(clip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('edit-desk-playhead').style.left).toBe(before)
  })

  it('按住段拖过邻段 = 换位置；拖的途中 Esc 放弃', () => {
    const { read } = renderDesk(emptyState, { initialNodeIds: ['v1', 'v2'] })
    const [first, second] = read().edit!.tracks.video
    const body = () => screen.getByTestId(`edit-desk-clip-${first!.id}`)

    fireEvent.pointerDown(body(), { clientX: 10, button: 0 })
    fireEvent.pointerMove(body(), { clientX: 5000 })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(body(), { clientX: 5000 })
    expect(read().edit!.tracks.video.map((clip) => clip.id)).toEqual([
      first!.id,
      second!.id,
    ])

    fireEvent.pointerDown(body(), { clientX: 10, button: 0 })
    fireEvent.pointerMove(body(), { clientX: 5000 })
    fireEvent.pointerUp(body(), { clientX: 5000 })
    expect(read().edit!.tracks.video.map((clip) => clip.id)).toEqual([
      second!.id,
      first!.id,
    ])
  })

  it('没选中也能直接拖段尾缩短；松手才落一条 op', () => {
    const { read } = renderDesk(emptyState, { initialNodeIds: ['v1'] })
    const clip = read().edit!.tracks.video[0]!
    const handle = screen.getByTestId(`edit-desk-handle-out-${clip.id}`)

    fireEvent.pointerDown(handle, { clientX: 400, button: 0 })
    fireEvent.pointerMove(handle, { clientX: 360 })
    expect(read().edit!.tracks.video[0]!.out).toBe(clip.out)
    fireEvent.pointerUp(handle, { clientX: 360 })
    expect(read().edit!.tracks.video[0]!.out).toBeLessThan(clip.out)
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
    fireEvent.pointerDown(screen.getByTestId('edit-desk-ruler'), {
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
    // ⚠ 按 `data-clip-index` 找，⛔ 不按 testid 前缀 —— `edit-desk-clip-` 这个前缀太宽，
    // 会把别的件一起命中。
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
  it('左列「文字」页「加一条字幕」= 在播放头处落一段，段上写内容首行，属性行换成字幕', () => {
    const { read } = renderDesk(emptyState)
    addCaption()

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
    addCaption()
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
    addCaption()
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
    addCaption()
    const clipId = (read().edit?.tracks.text ?? [])[0]!.id
    expect(
      screen.queryByTestId(`edit-desk-preview-text-${clipId}`),
    ).toBeInTheDocument()

    // 时间线只有这一段字幕（总长 3s）—— 把播放头拖到末尾之后
    fireEvent.pointerDown(screen.getByTestId('edit-desk-ruler'), {
      clientX: 10_000,
    })
    expect(screen.queryByTestId(`edit-desk-preview-text-${clipId}`)).toBeNull()
  })

  it('⌫ 删的是选中的那一段字幕（⛔ 不误伤 V 轨）', () => {
    const { read } = renderDesk(emptyState)
    openMaterials()
    fireEvent.doubleClick(screen.getByTestId('edit-desk-asset-v1'))
    addCaption()
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
    fireEvent.pointerDown(screen.getByTestId('edit-desk-ruler'), {
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
    fireEvent.click(screen.getByTestId('edit-desk-transition-trigger'))
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

describe('台词挂在主线上（v2 第 1 片）', () => {
  const clipOf = (id: string, patch: Record<string, unknown> = {}) => ({
    id,
    sourceNodeId: id === 'c1' || id === 'c2' ? 'v1' : 'a1',
    in: 0,
    out: 4,
    speed: 1,
    muted: false,
    ...patch,
  })
  const hung: NodeWorkflowStateV4 = {
    version: 4,
    nodes: [videoNode('v1'), audioNode('a1')],
    edges: [],
    edit: {
      name: '成片',
      tracks: {
        video: [clipOf('c1'), clipOf('c2')],
        // l1 是存量（没有起点，排在 0 秒）；l2 挂在 c2 素材 2 秒那一帧（时间线 6 秒）。
        audio: [
          clipOf('l1', { out: 1 }),
          clipOf('l2', {
            out: 1,
            startSec: 6,
            attach: { clipId: 'c2', atSec: 2 },
          }),
        ],
        music: [],
        text: [],
      },
      settings: { aspect: '16:9', resolution: '1080p' },
    },
  }
  /** 段视图外面那一层绝对定位的框（台词轨按起点摆）。 */
  /** 段的定位层（left 与断挂的半透明都在它上面）。 */
  const slotOf = (id: string): HTMLElement =>
    screen.getByTestId(`edit-desk-clip-${id}`).parentElement!

  it('voice lines sit at their own start and ride along when their shot moves', () => {
    const { pushRemote, read } = renderDesk(hung)
    expect(slotOf('l1').style.left).toBe('0px')
    const before = parseFloat(slotOf('l2').style.left)
    expect(before).toBeGreaterThan(0)

    const moved = applyNodeAssistantOpV4(
      read(),
      {
        op: NODE_ASSISTANT_OP_V4_IDS.editMoveClip,
        track: 'video',
        clipId: 'c2',
        toIndex: 0,
      },
      { now: NOW, mintId: (prefix) => `${prefix}_m` },
    )
    if (!moved.ok) throw new Error('move rejected')
    pushRemote(moved.state)

    // c2 挪到最前：素材 2 秒那一帧从 6 秒到了 2 秒。
    expect(parseFloat(slotOf('l2').style.left)).toBeCloseTo(before / 3, 3)
  })

  it('拖台词到别的镜头上：途中那一段描虚线框；松手挂点换过去、连接线亮一下（第 3 片 3b）', async () => {
    const { read } = renderDesk(hung)
    const line = screen.getByTestId('edit-desk-clip-l2')
    // jsdom 量不到宽度：每秒 40px。l2 在 6 秒（240px），往左拖 200px = 1 秒，落在 c1 上。
    fireEvent.pointerDown(line, { clientX: 240, button: 0 })
    fireEvent.pointerMove(line, { clientX: 40 })
    await waitFor(() =>
      expect(screen.getByTestId('edit-desk-clip-c1')).toHaveClass(
        'outline-dashed',
      ),
    )
    fireEvent.pointerUp(line, { clientX: 40 })

    expect(read().edit?.tracks.audio[1]?.attach?.clipId).toBe('c1')
    expect(screen.getByTestId('edit-desk-link-l2')).toHaveClass('bg-primary')
    expect(screen.getByTestId('edit-desk-clip-c1')).not.toHaveClass(
      'outline-dashed',
    )
  })

  it('a line whose frame was trimmed away fades out in place', () => {
    const { pushRemote, read } = renderDesk(hung)
    expect(slotOf('l2')).not.toHaveClass('opacity-30')

    const trimmed = applyNodeAssistantOpV4(
      read(),
      {
        op: NODE_ASSISTANT_OP_V4_IDS.editUpdateClip,
        track: 'video',
        clipId: 'c2',
        patch: { in: 3 },
      },
      { now: NOW, mintId: (prefix) => `${prefix}_t` },
    )
    if (!trimmed.ok) throw new Error('trim rejected')
    pushRemote(trimmed.state)

    expect(slotOf('l2')).toHaveClass('opacity-30')
    // 连接线跟着半透明
    expect(screen.getByTestId('edit-desk-link-l2')).toHaveClass('opacity-30')
  })
})
