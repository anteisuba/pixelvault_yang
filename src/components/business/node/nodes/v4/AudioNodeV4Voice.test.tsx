import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// jsdom 没有 ResizeObserver，而参数滑杆与归属下拉都是 radix 组件（内部要它）。
beforeAll(() => {
  if ('ResizeObserver' in globalThis) return
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// 声音库是一个带网络请求的对话框（`FishVoiceLibraryDialog` → `VoiceSelector`）。
// 本组测试要断言的是「四态槽点下去开不开库、选中一条音色写不写 op」，
// ⛔ 不测那个对话框自己 —— 桩成一颗能点的按钮。
vi.mock('../../FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: ({
    open,
    onSelectVoiceId,
  }: {
    open: boolean
    onSelectVoiceId(voice: { voiceId: string; sampleUrl?: string }): void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="voice-library"
        onClick={() =>
          onSelectVoiceId({
            voiceId: 'v_fish_01',
            sampleUrl: 'https://cdn/s.mp3',
          })
        }
      >
        library
      </button>
    ) : null,
}))

import type { NodeV4, NodeV4AudioData } from '@/types/node-workflow'

import { AudioNodeV4Voice } from './AudioNodeV4Voice'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

const NOW = '2026-09-07T00:00:00.000Z'

function voiceNode(data: Partial<NodeV4AudioData> = {}): NodeV4 {
  return {
    id: 'a_01',
    position: { x: 0, y: 0 },
    data: {
      kind: 'audio',
      subtype: 'voice',
      name: '阿岚的声音',
      status: 'idle',
      createdAt: NOW,
      ...data,
    } as NodeV4AudioData,
  }
}

function harness(
  node: NodeV4,
  overrides: Partial<NodeV4CanvasContextValue> = {},
): NodeV4CanvasContextValue {
  return {
    nodes: [node],
    edges: [],
    draggingFrom: null,
    changedNodeIds: [],
    expandedNodeId: node.id,
    selectedNodeIds: [],
    modelOptionsByKind: {},
    onToggleExpanded: vi.fn(),
    onSelectSlotVersion: vi.fn(),
    onDisconnectSlot: vi.fn(),
    onFocusNode: vi.fn(),
    onEditText: vi.fn(),
    onDeriveFromText: vi.fn(),
    onSetPrompt: vi.fn(),
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(),
    onTidyLayout: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  }
}

function renderVoice(
  node: NodeV4,
  overrides: Partial<NodeV4CanvasContextValue> = {},
) {
  const context = harness(node, overrides)
  const view = render(
    <NodeV4CanvasProvider value={context}>
      <AudioNodeV4Voice node={node} data={node.data as NodeV4AudioData} />
    </NodeV4CanvasProvider>,
  )
  return { ...view, context }
}

describe('音色槽的四态（C3c-②Q）', () => {
  it('空：没挑音色也没音频 → empty，且明说没有试听样本', () => {
    renderVoice(voiceNode())
    expect(
      screen.getByRole('button', { name: 'slotStates.empty' }),
    ).toBeTruthy()
    expect(screen.getByText('noSample')).toBeTruthy()
  })

  it('上传中：running / queued → loading，槽按不动', () => {
    renderVoice(voiceNode({ status: 'running' }))
    const slot = screen.getByRole('button', { name: 'slotStates.loading' })
    expect((slot as HTMLButtonElement).disabled).toBe(true)
  })

  it('已绑：有音频 → bound，且渲染出播放用的 audio 元素', () => {
    const { container } = renderVoice(
      voiceNode({
        url: 'https://cdn/voice.mp3',
        voiceProfile: { voiceId: 'v1' },
      }),
    )
    expect(
      screen.getByRole('button', { name: 'slotStates.bound' }),
    ).toBeTruthy()
    expect(container.querySelector('audio')?.getAttribute('src')).toBe(
      'https://cdn/voice.mp3',
    )
  })

  it('失败：status=failed → failed', () => {
    renderVoice(voiceNode({ status: 'failed', url: 'https://cdn/voice.mp3' }))
    expect(
      screen.getByRole('button', { name: 'slotStates.failed' }),
    ).toBeTruthy()
  })
})

describe('音色面板的参数与来源', () => {
  it('合成参数只在挑了库里的 voiceId 之后露出', () => {
    const { container: withoutVoice } = renderVoice(
      voiceNode({ url: 'https://cdn/uploaded.mp3' }),
    )
    // 自己传的一段音频已经录成那样了 —— 显示语速/音量就是在暗示可以调。
    expect(withoutVoice.querySelector('[data-voice-synthesis]')).toBeNull()

    const { container: withVoice } = renderVoice(
      voiceNode({ voiceProfile: { voiceId: 'v_fish_01' } }),
    )
    expect(withVoice.querySelector('[data-voice-synthesis]')).toBeTruthy()
  })

  it('情绪按一下走 set_voice_profile，⛔ 不直接改节点', () => {
    const onApplyOp = vi.fn()
    const { container } = renderVoice(
      voiceNode({ voiceProfile: { voiceId: 'v_fish_01' } }),
      { onApplyOp },
    )
    const emotion = container.querySelector('[data-voice-emotion="angry"]')
    expect(emotion).toBeTruthy()
    fireEvent.click(emotion as Element)
    expect(onApplyOp).toHaveBeenCalledWith({
      op: 'set_voice_profile',
      target: 'a_01',
      profile: { emotion: 'angry' },
    })
  })

  it('空态点槽 = 开声音库；库里选中一条 → 写 voiceId + 把试听样本落进 url', () => {
    const onApplyOp = vi.fn()
    const onSetMedia = vi.fn()
    renderVoice(voiceNode(), { onApplyOp, onSetMedia })
    fireEvent.click(screen.getByRole('button', { name: 'slotStates.empty' }))
    fireEvent.click(screen.getByTestId('voice-library'))
    expect(onApplyOp).toHaveBeenCalledWith({
      op: 'set_voice_profile',
      target: 'a_01',
      profile: { voiceId: 'v_fish_01' },
    })
    expect(onSetMedia).toHaveBeenCalledWith('a_01', {
      url: 'https://cdn/s.mp3',
    })
  })

  it('归属角色区在合成参数之外始终在场（候选取自画布上的角色卡）', () => {
    const node = voiceNode()
    const character: NodeV4 = {
      id: 'c_01',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        subtype: 'character',
        name: 'c_01',
        characterName: '阿岚',
        status: 'idle',
        createdAt: NOW,
      },
    }
    render(
      <NodeV4CanvasProvider value={harness(node, { nodes: [node, character] })}>
        <AudioNodeV4Voice node={node} data={node.data as NodeV4AudioData} />
      </NodeV4CanvasProvider>,
    )
    // 下拉的候选项住在 radix 的 portal 里，要点开才渲染 —— 这里只断言选择器
    // 在场且停在「未归属」，候选的装配另有 `ownerCandidates` 的纯逻辑守着。
    expect(screen.getByLabelText('ownerLabel')).toBeTruthy()
    expect(screen.getByText('ownerNone')).toBeTruthy()
  })
})
