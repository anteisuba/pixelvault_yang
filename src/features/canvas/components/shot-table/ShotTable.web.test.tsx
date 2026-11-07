import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import { planShotMerge } from '@/lib/shot-pull-plan'
import { zh as messages } from '@/messages'
import type { CharacterCardRecord } from '@/types'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
  NodeWorkflowShotlist,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import { ShotTable } from './ShotTable'
import type { ShotPullSourceActions } from './ShotPullSourcePicker'

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

function setup(
  nodes: readonly NodeV4[],
  shotlist?: NodeWorkflowShotlist,
  options: {
    readonly withPorts?: boolean
    readonly edges?: readonly NodeWorkflowEdgeV4[]
    readonly characterCards?: readonly CharacterCardRecord[]
    readonly focusSourceId?: string
    readonly pull?: ShotPullSourceActions
  } = {},
) {
  const dispatch = vi.fn(() => true)
  const dispatchBatch = vi.fn()
  const onAddShot = vi.fn()
  const onLocate = vi.fn()
  const state = {
    version: 4,
    nodes,
    edges: options.edges ?? [],
    shotlist,
  } as unknown as NodeWorkflowStateV4
  render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <ShotTable
        state={state}
        characterCards={options.characterCards ?? []}
        dispatch={dispatch}
        dispatchBatch={dispatchBatch}
        onAddShot={onAddShot}
        onLocate={onLocate}
        {...(options.withPorts
          ? {
              renderRowPort: (nodeId: string) => (
                <span data-testid="row-port" data-for={nodeId} />
              ),
              renderRowInPort: (nodeId: string) => (
                <span data-testid="row-in-port" data-for={nodeId} />
              ),
              renderTopInPort: () => <span data-testid="top-in-port" />,
            }
          : {})}
        {...(options.focusSourceId
          ? { focusSourceId: options.focusSourceId }
          : {})}
        {...(options.pull ? { pull: options.pull } : {})}
      />
    </NextIntlClientProvider>,
  )
  return { dispatch, dispatchBatch, onAddShot, onLocate }
}

describe('ShotTable', () => {
  it('一镜一行，按镜号排', () => {
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

  it('空表三条来路：只有「自己写」能点，点了 = 加一镜', () => {
    const { onAddShot } = setup([])
    expect(screen.getByTestId('shot-table-empty')).toBeTruthy()
    const write = screen.getByTestId('shot-table-source-write')
    expect(write.hasAttribute('disabled')).toBe(false)
    expect(
      screen
        .getByTestId('shot-table-source-assistant')
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByTestId('shot-table-source-breakdown')
        .hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.click(write)
    expect(onAddShot).toHaveBeenCalledTimes(1)
  })

  it('表头「+ 加一镜」交给宿主落卡', () => {
    const { onAddShot } = setup([shot('a', 1)])
    fireEvent.click(screen.getByTestId('shot-table-add-shot'))
    expect(onAddShot).toHaveBeenCalledTimes(1)
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

  it('⚠ 整份替换带着 board：清空风格，表照样坐在画布上', () => {
    const { dispatch } = setup([shot('a', 1)], {
      look: '冷蓝',
      board: { x: 40, y: -80 },
    })
    const input = screen.getByTestId('shot-table-film-look')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(dispatch).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setShotlist,
      shotlist: { board: { x: 40, y: -80 } },
    })
  })

  it('关掉的列不渲染', () => {
    setup([shot('a', 1)], { hiddenColumns: ['duration', 'cast'] })
    expect(screen.queryByTestId('shot-table-duration')).toBeNull()
  })

  it('「回到这张卡」带着 id；表里不再接管 Esc（全屏模式已删）', () => {
    const { onLocate } = setup([shot('a', 1)])
    fireEvent.click(screen.getByTestId('shot-table-locate'))
    expect(onLocate).toHaveBeenCalledWith('a')
    expect(screen.queryByTestId('shot-table-back')).toBeNull()
    expect(screen.queryByTestId('shot-table-undo')).toBeNull()
  })

  it('每行右缘一颗出口、左缘一颗入口，按行序给到这一镜的 id；表头一颗入口', () => {
    setup([shot('b', 2), shot('a', 1)], undefined, { withPorts: true })
    expect(
      screen
        .getAllByTestId('row-port')
        .map((port) => port.getAttribute('data-for')),
    ).toEqual(['a', 'b'])
    expect(
      screen
        .getAllByTestId('row-in-port')
        .map((port) => port.getAttribute('data-for')),
    ).toEqual(['a', 'b'])
    expect(screen.getAllByTestId('top-in-port')).toHaveLength(1)
  })

  describe('素材列（H2a）', () => {
    const image = (id: string, subtype: string, name = id): NodeV4 => ({
      id,
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        subtype,
        name,
        status: 'idle',
        createdAt: NOW,
        url: `https://cdn/${id}.png`,
      } as NodeV4Data,
    })
    const edge = (
      id: string,
      source: string,
      target: string,
      slot: NodeWorkflowEdgeV4['slot'],
    ): NodeWorkflowEdgeV4 => ({
      id,
      source,
      sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
      target,
      slot,
    })

    it('列名「素材」，真边按 首帧 / 场景 出现（名字只在悬停与读屏里）', () => {
      setup(
        [
          shot('a', 1, { prompt: '雪落' } as Partial<NodeV4Data>),
          image('frame', 'shot', '车窗'),
          image('bg', 'background', '街道'),
        ],
        undefined,
        {
          edges: [
            edge('e1', 'bg', 'a', NODE_SLOT_IDS.reference),
            edge('e2', 'frame', 'a', NODE_SLOT_IDS.firstFrame),
          ],
        },
      )
      expect(screen.getByText('素材')).toBeTruthy()
      const chips = screen.getAllByTestId('shot-table-material')
      expect(chips.map((chip) => chip.getAttribute('data-role'))).toEqual([
        'first',
        'scene',
      ])
      expect(chips[0]?.getAttribute('aria-label')).toBe('车窗 · 首帧')
      expect(chips[1]?.getAttribute('aria-label')).toBe('街道 · 场景')
    })

    it('「+」从全片素材加 = 说明末尾写回 @（一条 set_prompt）', () => {
      const { dispatch } = setup(
        [
          shot('a', 1, { prompt: '雪落' } as Partial<NodeV4Data>),
          shot('b', 2, { prompt: '车来' } as Partial<NodeV4Data>),
          image('bg', 'background', '街道'),
        ],
        undefined,
        { edges: [edge('e1', 'bg', 'a', NODE_SLOT_IDS.reference)] },
      )
      const adds = screen.getAllByTestId('shot-table-material-add')
      fireEvent.click(adds[1]!)
      fireEvent.click(screen.getByTestId('shot-table-material-add-item'))
      expect(dispatch).toHaveBeenCalledWith({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: 'b',
        prompt: '车来 @街道',
        mode: 'replace',
      })
    })

    it('「从这镜移除」手拖的边 = disconnect', () => {
      const { dispatch } = setup(
        [
          shot('a', 1, { prompt: '雪落' } as Partial<NodeV4Data>),
          image('bg', 'background', '街道'),
        ],
        undefined,
        { edges: [edge('e1', 'bg', 'a', NODE_SLOT_IDS.reference)] },
      )
      fireEvent.click(screen.getByTestId('shot-table-material'))
      fireEvent.click(screen.getByTestId('shot-table-material-remove'))
      expect(dispatch).toHaveBeenCalledWith({
        op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
        edgeId: 'e1',
      })
    })

    it('首帧被别的素材占着：选「首帧」= 和它对调（一批 op）；「在画布上看它」定位到素材卡', () => {
      const { dispatchBatch, onLocate } = setup(
        [
          shot('a', 1, { prompt: '雪落' } as Partial<NodeV4Data>),
          image('frame', 'shot', '车窗'),
          image('bg', 'background', '街道'),
        ],
        undefined,
        {
          edges: [
            edge('e1', 'bg', 'a', NODE_SLOT_IDS.reference),
            edge('e2', 'frame', 'a', NODE_SLOT_IDS.firstFrame),
          ],
        },
      )
      const scene = screen
        .getAllByTestId('shot-table-material')
        .find((chip) => chip.getAttribute('data-source') === 'bg')!
      fireEvent.click(scene)
      const asFirst = screen.getByTestId('shot-table-material-as-first')
      // 占位者的小图挂在按钮右上角，读屏念出「和「车窗」对调」
      expect(screen.getByTestId('shot-table-material-swap-with')).toBeTruthy()
      expect(asFirst.getAttribute('aria-label')).toContain('和「车窗」对调')
      fireEvent.click(asFirst)
      expect(dispatchBatch).toHaveBeenCalledWith([
        { op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: 'e2' },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: 'frame',
          target: 'a',
          slot: NODE_SLOT_IDS.reference,
        },
        { op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: 'e1' },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: 'bg',
          target: 'a',
          slot: NODE_SLOT_IDS.firstFrame,
        },
      ])
      fireEvent.click(scene)
      fireEvent.click(screen.getByTestId('shot-table-material-locate'))
      expect(onLocate).toHaveBeenCalledWith('bg')
    })
  })

  describe('全片素材与画布侧（H2b）', () => {
    const image = (id: string, subtype: string, name = id): NodeV4 => ({
      id,
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        subtype,
        name,
        status: 'idle',
        createdAt: NOW,
        url: `https://cdn/${id}.png`,
      } as NodeV4Data,
    })
    const edge = (
      id: string,
      source: string,
      target: string,
    ): NodeWorkflowEdgeV4 => ({
      id,
      source,
      sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
      target,
      slot: NODE_SLOT_IDS.reference,
    })
    const LIB = {
      id: 'lib-qiu',
      name: '秋',
      looks: [],
    } as unknown as CharacterCardRecord
    const nodes = [
      shot('a', 1, { prompt: '雪落' } as Partial<NodeV4Data>),
      shot('b', 2, { prompt: '车来' } as Partial<NodeV4Data>),
      image('bg', 'background', '街道'),
      image('tv', 'reference', '电视'),
      image('cat', 'reference', '猫'),
    ]

    it('「+」里闲着的才有 ✕；点 ✕ = 一条 set_shotlist 移出，board 照留', () => {
      const { dispatch } = setup(
        nodes,
        { materials: ['tv', 'bg'], board: { x: 1, y: 2 } },
        { edges: [edge('e1', 'bg', 'a')] },
      )
      fireEvent.click(screen.getAllByTestId('shot-table-material-add')[1]!)
      const items = screen.getAllByTestId('shot-table-material-add-item')
      expect(items.map((item) => item.getAttribute('data-source'))).toEqual([
        'bg',
        'tv',
      ])
      expect(items.map((item) => item.getAttribute('data-idle'))).toEqual([
        null,
        'true',
      ])
      const removes = screen.getAllByTestId('shot-table-material-film-remove')
      expect(removes.map((x) => x.getAttribute('data-source'))).toEqual(['tv'])
      fireEvent.click(removes[0]!)
      expect(dispatch).toHaveBeenCalledWith({
        op: NODE_ASSISTANT_OP_V4_IDS.setShotlist,
        shotlist: { board: { x: 1, y: 2 }, materials: ['bg'] },
      })
    })

    it('「从画布 / 角色库拿」= 两段格子；点一张 = 加进这一镜', () => {
      const { dispatch } = setup(
        nodes,
        { materials: ['tv'] },
        { edges: [edge('e1', 'bg', 'a')], characterCards: [LIB] },
      )
      fireEvent.click(screen.getAllByTestId('shot-table-material-add')[1]!)
      fireEvent.click(screen.getByTestId('shot-table-material-pick-more'))
      expect(screen.queryByTestId('shot-table-material-add-item')).toBeNull()
      const canvas = screen.getByTestId('shot-table-material-picks-canvas')
      const library = screen.getByTestId('shot-table-material-picks-library')
      expect(canvas.textContent).toContain('画布上的')
      expect(library.textContent).toContain('角色库')
      const sources = (el: HTMLElement) =>
        Array.from(
          el.querySelectorAll('[data-testid="shot-table-material-pick"]'),
        ).map((pick) => pick.getAttribute('data-source'))
      expect(sources(canvas)).toEqual(['cat'])
      expect(sources(library)).toEqual(['lib-qiu'])
      // 格子下面写名字：同封面的人只看图分不出
      expect(
        screen
          .getAllByTestId('shot-table-material-pick-name')
          .map((name) => name.textContent),
      ).toEqual(['猫', '秋'])
      fireEvent.click(screen.getByLabelText('把「秋」加进镜 2'))
      expect(dispatch).toHaveBeenCalledWith({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: 'b',
        prompt: '车来 @秋',
        mode: 'replace',
      })
    })

    it('画布点着一张素材：用到它的行浅蓝、其它行变淡，它的格子描蓝边', () => {
      setup(nodes, undefined, {
        edges: [edge('e1', 'bg', 'b'), edge('e2', 'tv', 'a')],
        focusSourceId: 'bg',
      })
      const rows = screen.getAllByTestId('shot-table-row')
      expect(rows.map((row) => row.getAttribute('data-focus'))).toEqual([
        'off',
        'on',
      ])
      const tiles = screen.getAllByTestId('shot-table-material')
      expect(
        tiles.map((tile) => [
          tile.getAttribute('data-source'),
          tile.getAttribute('data-focused'),
        ]),
      ).toEqual([
        ['tv', null],
        ['bg', 'true'],
      ])
    })
  })

  describe('拉片（H4a）', () => {
    const CLIP_URL = 'https://cdn.anteisuba.com/clip.mp4'

    function clip(id: string, reference: boolean): NodeV4 {
      return {
        id,
        position: { x: 0, y: 0 },
        data: {
          kind: 'video',
          subtype: 'clip',
          name: id,
          label: id,
          status: 'idle',
          createdAt: NOW,
          url: CLIP_URL,
          ...(reference ? { clipRole: 'reference' } : {}),
        } as NodeV4Data,
      }
    }

    function pulled(
      id: string,
      shotNo: number,
      startSec: number,
      endSec: number,
      draft = true,
    ): NodeV4 {
      return shot(id, shotNo, {
        shot: { ref: { nodeId: 'ref', startSec, endSec }, draft },
      } as Partial<NodeV4Data>)
    }

    function pullActions() {
      return { onPull: vi.fn(), onUpload: vi.fn(), onLibrary: vi.fn() }
    }

    it('草稿行带草稿标；时长格下写参考段长', () => {
      setup([clip('ref', true), pulled('a', 1, 0, 3.04)])
      const row = screen.getByTestId('shot-table-row')
      expect(row.getAttribute('data-draft')).toBe('true')
      expect(screen.getByTestId('shot-table-draft-mark')).toBeTruthy()
      expect(screen.getByTestId('shot-table-ref-span').textContent).toBe(
        '参考 3s',
      )
    })

    it('改过的行不是草稿：没有草稿标', () => {
      setup([clip('ref', true), pulled('a', 1, 0, 3, false)])
      expect(
        screen.getByTestId('shot-table-row').getAttribute('data-draft'),
      ).toBeNull()
      expect(screen.queryByTestId('shot-table-draft-mark')).toBeNull()
    })

    it('草稿行改运镜 = 同一条 set_shot_spec 顺手去掉草稿', () => {
      const { dispatch } = setup([clip('ref', true), pulled('a', 1, 0, 3)])
      const input = screen.getByTestId('shot-table-move')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '缓推' } })
      fireEvent.blur(input)
      expect(dispatch).toHaveBeenCalledWith({
        op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
        target: 'a',
        spec: { move: '缓推', draft: null },
      })
    })

    it('草稿行改说明 = set_prompt + 去草稿，一批（一步撤销）', () => {
      const { dispatch, dispatchBatch } = setup([
        clip('ref', true),
        pulled('a', 1, 0, 3),
      ])
      const note = screen.getByTestId('shot-table-note')
      fireEvent.focus(note)
      fireEvent.change(note, { target: { value: '她回头' } })
      fireEvent.blur(note)
      expect(dispatch).not.toHaveBeenCalled()
      expect(dispatchBatch).toHaveBeenCalledWith([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
          target: 'a',
          prompt: '她回头',
          mode: 'replace',
        },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
          target: 'a',
          spec: { draft: null },
        },
      ])
    })

    it('草稿行手改时长：锁住 + 去草稿在同一条', () => {
      const { dispatchBatch } = setup([clip('ref', true), pulled('a', 1, 0, 3)])
      const input = screen.getByTestId('shot-table-duration')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '5' } })
      fireEvent.blur(input)
      expect(dispatchBatch).toHaveBeenCalledWith([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setParams,
          target: 'a',
          params: { duration: '5' },
        },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
          target: 'a',
          spec: { durationLocked: true, draft: null },
        },
      ])
    })

    it('同一张参考片首尾相接的下一行才有「和上一镜合并」；点了 = 合并计划一批', () => {
      const nodes = [
        clip('ref', true),
        pulled('a', 1, 0, 3),
        pulled('b', 2, 3, 5),
        pulled('c', 3, 6, 8),
      ]
      const { dispatchBatch } = setup(nodes)
      const rows = screen.getAllByTestId('shot-table-row')
      const merges = rows.map(
        (row) =>
          row.querySelector('[data-testid="shot-table-merge-up"]') !== null,
      )
      // a 没有上一行；b 接着 a；c 和 b 中间空了一秒，不能合。
      expect(merges).toEqual([false, true, false])
      fireEvent.click(screen.getByTestId('shot-table-merge-up'))
      expect(dispatchBatch).toHaveBeenCalledWith(planShotMerge(nodes, 'a', 'b'))
    })

    it('没传 pull：「拉片」键不在，空表「拆参考片」灰着', () => {
      setup([clip('ref', true), pulled('a', 1, 0, 3)])
      expect(screen.queryByTestId('shot-table-pull')).toBeNull()
    })

    it('空表 + 画布上恰好一张参考片：点「拆参考片」直接拉它，不多问', () => {
      const pull = pullActions()
      setup([clip('ref', true), clip('other', false)], undefined, { pull })
      const key = screen.getByTestId('shot-table-source-breakdown')
      expect(key.hasAttribute('disabled')).toBe(false)
      fireEvent.click(key)
      expect(pull.onPull).toHaveBeenCalledWith('ref')
      expect(screen.queryByTestId('shot-pull-picker')).toBeNull()
    })

    it('参考片不止一张：表头「拉片」先问拉哪张，参考片排在前面', () => {
      const pull = pullActions()
      setup(
        [
          clip('plain', false),
          clip('ref', true),
          clip('ref2', true),
          pulled('a', 1, 0, 3),
        ],
        undefined,
        { pull },
      )
      fireEvent.click(screen.getByTestId('shot-table-pull'))
      expect(screen.getByTestId('shot-pull-picker')).toBeTruthy()
      const items = screen.getAllByTestId('shot-pull-picker-clip')
      expect(items.map((item) => item.getAttribute('data-node-id'))).toEqual([
        'ref',
        'ref2',
        'plain',
      ])
      fireEvent.click(items[2] as HTMLElement)
      expect(pull.onPull).toHaveBeenCalledWith('plain')
    })
  })
})
