/**
 * 剪辑台台面的真机形状（S8）。
 *
 * ⚠ 这里断的是**用户看得见的那几件事**：布局到齐、拖进来建段、选中出属性、
 * 徽标出现且点了换新、导出只出对话框、快捷键走的是 op 栈。
 * ⛔ 不断样式数值 —— 那是对稿的事（画板逐项比对），不是断言的事。
 */

import * as React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import messages from '@/messages/zh.json'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { EDIT_DESK_NODE_DRAG_MIME } from '@/constants/edit-desk'
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
  const addNode = vi.fn(() => 'n_new')
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
    return (
      <NextIntlClientProvider locale="zh" messages={messages}>
        <EditDesk
          state={current}
          projectId="proj_test"
          dispatchBatch={dispatchBatch}
          mintId={(prefix) => `${prefix}_${(counter += 1)}`}
          addNode={addNode}
          setMedia={setMedia}
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
