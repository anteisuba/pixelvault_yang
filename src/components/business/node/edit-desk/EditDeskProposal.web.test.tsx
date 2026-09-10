/**
 * 提案态的真机形状（S10）：便条投出去 → 幽灵段 + 提案卡 → 三键 → 逐段采用合并。
 *
 * ⚠ 断的仍然是**用户看得见的那几件事**，⛔ 不断样式数值（那是对稿的事）。
 */

import * as React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import messages from '@/messages/zh.json'
import { EDIT_TRANSITION_IDS } from '@/constants/edit-desk'
import { applyNodeAssistantOpV4 } from '@/lib/node-assistant-op-apply-v4'
import {
  deliverTimelineProposal,
  subscribeTimelinePlanRequest,
  takeTimelinePlanRequest,
} from '@/lib/timeline-plan-request'
import type { TimelineProposal } from '@/types/edit-desk-plan'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { EditDesk } from './EditDesk'

const NOW = '2026-09-10T00:00:00.000Z'

function videoNode(id: string): NodeV4 {
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
      url: `https://example.test/${id}.mp4`,
      durationSec: 7,
    },
  } as NodeV4
}

const state: NodeWorkflowStateV4 = {
  version: 4,
  nodes: [videoNode('v1'), videoNode('v2')],
  edges: [],
}

function proposalOf(): TimelineProposal {
  return {
    project: {
      name: 'cut',
      tracks: {
        video: [
          {
            id: 'clip_a',
            sourceNodeId: 'v1',
            in: 1,
            out: 6,
            speed: 1,
            muted: false,
            transitionOut: EDIT_TRANSITION_IDS.crossfade,
          },
          {
            id: 'clip_b',
            sourceNodeId: 'v2',
            in: 1,
            out: 6,
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
    rationale: [
      {
        clipId: 'clip_a',
        nodeId: 'v1',
        take: 'middle',
        inSec: 1,
        outSec: 6,
        sourceDurationSec: 7,
        reason: '前一秒在抖',
      },
      {
        clipId: 'clip_b',
        nodeId: 'v2',
        take: 'middle',
        inSec: 1,
        outSec: 6,
        sourceDurationSec: 7,
      },
    ],
    summary: '按剧本顺序拼，各取中间 5 秒，叠化。',
    counts: { clipsChanged: 2, tracksAdded: 0 },
    cost: 'free',
  }
}

function renderDesk() {
  let current = state
  let counter = 0
  const batches: (readonly NodeAssistantOpV4[])[] = []

  function Host() {
    const [live, setLive] = React.useState(current)
    const dispatchBatch = (ops: readonly NodeAssistantOpV4[]) => {
      batches.push(ops)
      let next = live
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
      current = next
      setLive(next)
      return { applied }
    }
    return (
      <NextIntlClientProvider locale="zh" messages={messages}>
        <EditDesk
          state={live}
          projectId="proj_test"
          dispatchBatch={dispatchBatch}
          mintId={(prefix) => `${prefix}_${(counter += 1)}`}
          addNode={vi.fn(() => 'n_new')}
          setMedia={vi.fn()}
          connect={vi.fn(() => true)}
          canUndo
          onUndo={vi.fn()}
          onExit={vi.fn()}
          onBackToNode={vi.fn()}
        />
      </NextIntlClientProvider>
    )
  }

  render(<Host />)
  return { batches, read: () => current }
}

describe('剪辑台 · 一句话排片提案', () => {
  it('排片栏发送 = 投一张便条（⛔ 台面自己不发请求）', () => {
    renderDesk()
    const seen: string[] = []
    const stop = subscribeTimelinePlanRequest(() => {
      const request = takeTimelinePlanRequest()
      if (request) seen.push(request.prompt)
    })

    const input = screen.getByLabelText(
      messages.StudioNode.editDesk.planAria,
    ) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '按剧本顺序拼' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    stop()
    expect(seen).toEqual(['按剧本顺序拼'])
  })

  it('提案到达 → 幽灵段上轨 + 提案卡三键 + 现有段没被动过', () => {
    const { batches } = renderDesk()
    act(() => deliverTimelineProposal(proposalOf()))

    expect(screen.getByTestId('edit-desk-proposal-card')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-ghost-clip_a')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-ghost-clip_b')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-proposal-adopt')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-proposal-review')).toBeInTheDocument()
    expect(screen.getByTestId('edit-desk-proposal-discard')).toBeInTheDocument()
    // ⚠ 采用之前一条 op 都没发过。
    expect(batches).toHaveLength(0)
  })

  it('采用 = 一批一条 op，整份落表', () => {
    const { batches, read } = renderDesk()
    act(() => deliverTimelineProposal(proposalOf()))
    fireEvent.click(screen.getByTestId('edit-desk-proposal-adopt'))

    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(1)
    expect(read().edit?.tracks.video.map((clip) => clip.id)).toEqual([
      'clip_a',
      'clip_b',
    ])
    expect(screen.queryByTestId('edit-desk-proposal-card')).toBeNull()
  })

  it('撤销 = 丢掉提案，一条 op 都不发', () => {
    const { batches } = renderDesk()
    act(() => deliverTimelineProposal(proposalOf()))
    fireEvent.click(screen.getByTestId('edit-desk-proposal-discard'))

    expect(screen.queryByTestId('edit-desk-proposal-card')).toBeNull()
    expect(screen.queryByTestId('edit-desk-ghost-clip_a')).toBeNull()
    expect(batches).toHaveLength(0)
  })

  it('逐段看 → 采用一段 + 跳过一段 → 只落被采用的那一段，仍是一批', () => {
    const { batches, read } = renderDesk()
    act(() => deliverTimelineProposal(proposalOf()))
    fireEvent.click(screen.getByTestId('edit-desk-proposal-review'))

    // 右栏换成逐段栏，显示这一段的理由。
    expect(
      screen.getByTestId('edit-desk-proposal-inspector'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('edit-desk-inspector')).toBeNull()
    expect(screen.getByText(/前一秒在抖/)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('edit-desk-proposal-accept-clip'))
    // 第二段：跳过 → 落表。
    fireEvent.click(screen.getByTestId('edit-desk-proposal-skip-clip'))

    expect(batches).toHaveLength(1)
    expect(read().edit?.tracks.video.map((clip) => clip.id)).toEqual(['clip_a'])
  })

  it('提案期间导出灰掉且给一句话', () => {
    renderDesk()
    act(() => deliverTimelineProposal(proposalOf()))
    const exportButton = screen.getByTestId('edit-desk-export')
    expect(exportButton).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(exportButton)
    expect(screen.queryByTestId('edit-desk-export-dialog')).toBeNull()
  })
})
