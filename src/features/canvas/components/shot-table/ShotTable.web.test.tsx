import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { zh as messages } from '@/messages'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowShotlist,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import { ShotTable } from './ShotTable'

const NOW = '2026-11-02T00:00:00.000Z'

function shot(
  id: string,
  shotNo: number,
  extra: Partial<NodeV4Data> = {},
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
      shotNo,
      ...extra,
    } as NodeV4Data,
  }
}

function setup(nodes: readonly NodeV4[], shotlist?: NodeWorkflowShotlist) {
  const dispatch = vi.fn(() => true)
  const dispatchBatch = vi.fn()
  const onExit = vi.fn()
  const onBackToNode = vi.fn()
  const state = { nodes, edges: [], shotlist } as unknown as NodeWorkflowStateV4
  render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <ShotTable
        state={state}
        characterCards={[]}
        dispatch={dispatch}
        dispatchBatch={dispatchBatch}
        canUndo={false}
        onUndo={vi.fn()}
        onExit={onExit}
        onBackToNode={onBackToNode}
      />
    </NextIntlClientProvider>,
  )
  return { dispatch, dispatchBatch, onExit, onBackToNode }
}

describe('ShotTable', () => {
  it('一镜一行，按镜号排；没镜头时给空态', () => {
    setup([
      shot('b', 2, { prompt: '第二镜' } as Partial<NodeV4Data>),
      shot('a', 1, { prompt: '第一镜' } as Partial<NodeV4Data>),
    ])
    const rows = screen.getAllByTestId('shot-table-row')
    expect(rows.map((row) => row.getAttribute('data-node-id'))).toEqual([
      'a',
      'b',
    ])
    expect(screen.getByTestId('shot-table-summary').textContent).toContain(
      '2 镜',
    )
  })

  it('空表', () => {
    setup([])
    expect(screen.getByTestId('shot-table-empty')).toBeTruthy()
  })

  it('改运镜 = 一条 set_shot_spec；没改不发', () => {
    const { dispatch } = setup([
      shot('a', 1, { prompt: 'x' } as Partial<NodeV4Data>),
    ])
    const input = screen.getByTestId('shot-table-move')
    fireEvent.focus(input)
    fireEvent.blur(input)
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '缓慢推近' } })
    fireEvent.blur(input)
    expect(dispatch).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
      target: 'a',
      spec: { move: '缓慢推近' },
    })
  })

  it('改说明 = set_prompt 整段替换', () => {
    const { dispatch } = setup([
      shot('a', 1, { prompt: '旧' } as Partial<NodeV4Data>),
    ])
    const note = screen.getByTestId('shot-table-note')
    fireEvent.focus(note)
    fireEvent.change(note, { target: { value: '新的一镜' } })
    fireEvent.blur(note)
    expect(dispatch).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
      target: 'a',
      prompt: '新的一镜',
      mode: 'replace',
    })
  })

  it('手改时长 = 改参数并锁住，一步撤销', () => {
    const { dispatchBatch } = setup([shot('a', 1)])
    const input = screen.getByTestId('shot-table-duration')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '6' } })
    fireEvent.blur(input)
    expect(dispatchBatch).toHaveBeenCalledWith([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.setParams,
        target: 'a',
        params: { duration: '6' },
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
        target: 'a',
        spec: { durationLocked: true },
      },
    ])
  })

  it('全片风格写进 shotlist，清空就整份去掉', () => {
    const { dispatch } = setup([shot('a', 1)], { look: '冷蓝' })
    const input = screen.getByTestId('shot-table-film-look')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(dispatch).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setShotlist,
      shotlist: undefined,
    })
  })

  it('关掉的列不渲染', () => {
    setup([shot('a', 1)], { hiddenColumns: ['duration', 'cast'] })
    expect(screen.queryByTestId('shot-table-duration')).toBeNull()
  })

  it('Esc 回画布；「回到这张卡」带着 id', () => {
    const { onExit, onBackToNode } = setup([shot('a', 1)])
    fireEvent.click(screen.getByTestId('shot-table-locate'))
    expect(onBackToNode).toHaveBeenCalledWith('a')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExit).toHaveBeenCalled()
  })
})
