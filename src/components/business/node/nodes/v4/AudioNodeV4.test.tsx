import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))

vi.mock('@xyflow/react', () => ({
  Handle: (props: Record<string, unknown>) => (
    <span data-testid="handle" data-slot={props['data-slot'] as string} />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? (
      <div data-testid={`flow-toolbar-${String(props.position)}`}>
        {props.children as ReactNode}
      </div>
    ) : null,
}))

const uploadFn = vi.fn(async () => ({ url: 'https://cdn.test/up.mp3' }))
vi.mock('@/hooks/node/use-node-upload-v4', () => ({
  useNodeUploadV4: () => ({
    upload: uploadFn,
    retry: vi.fn(),
    isUploading: false,
    progress: 0,
    error: null,
    canRetry: false,
    cancel: vi.fn(),
  }),
}))

const generateNode = vi.fn(async () => ({ success: false as const }))
vi.mock('@/hooks/node/use-node-media-generation-v4', () => ({
  useNodeMediaGenerationV4: () => ({ generateNode, isLoading: false }),
}))

/** 声音库的事实层桩掉：本组要看的是弹层长什么样、点了写什么，不是拉取。 */
vi.mock('@/hooks/use-voice-library', () => ({
  useVoiceLibrary: () => ({
    cloned: [
      {
        id: 'c1',
        name: '莫宁',
        voiceId: 'fish_morning',
        tone: ['低沉'],
        referenceAudioUrl: 'https://cdn.test/ref.mp3',
        sampleAudioUrl: null,
      },
    ],
    favorites: [
      {
        id: 'f1',
        name: '旁白 · 标准',
        voiceId: 'fish_narrator',
        tone: [],
        referenceAudioUrl: null,
        sampleAudioUrl: 'https://cdn.test/sample.mp3',
      },
    ],
    isLoading: false,
  }),
  isClonedVoiceCard: (card: { referenceAudioUrl: string | null }) =>
    Boolean(card.referenceAudioUrl),
}))

vi.mock('../../FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: () => <div data-testid="voice-library-dialog" />,
}))

import { AI_MODELS } from '@/constants/models'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { VOICE_MARKUP_INTENSITY_IDS } from '@/lib/voice-markup'
import type { NodeV4, NodeWorkflowModelOption } from '@/types/node-workflow'

import { AudioNodeV4 } from './AudioNodeV4'
import { AudioModelChip } from './audio/AudioModelChip'
import { AudioTonePopover } from './audio/AudioTonePopover'
import { AudioVoiceChip } from './audio/AudioVoiceChip'
import {
  AUDIO_CARD,
  audioModelGroups,
  buildAudioWaveformBars,
  resolveAudioNodeKind,
  showsVoiceChip,
} from './audio/audio-node-model'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

const NOW = '2026-09-10T00:00:00.000Z'

beforeAll(() => {
  // Radix 的滑杆要量尺寸；jsdom 没有 `ResizeObserver`。
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })
  // jsdom 没有实现媒体播放；悬停自动播只要不抛就行。
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => undefined),
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(),
  })
})

function audioNode(id: string, data: Record<string, unknown> = {}): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'audio',
      subtype: 'voice',
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...data,
    },
  } as NodeV4
}

function modelOption(
  optionId: string,
  modelId: string,
): NodeWorkflowModelOption {
  return {
    optionId,
    modelId,
    adapterType: 'fish_audio',
    providerConfig: {},
    requestCount: 0,
    sourceType: 'workspace',
  } as unknown as NodeWorkflowModelOption
}

function harness(
  nodes: readonly NodeV4[],
  overrides: Partial<NodeV4CanvasContextValue> = {},
): NodeV4CanvasContextValue {
  return {
    nodes,
    edges: [],
    draggingFrom: null,
    changedNodeIds: [],
    expandedNodeId: null,
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

function renderAudio(
  context: NodeV4CanvasContextValue,
  nodeId = 'a_1',
  selected = false,
) {
  const target = context.nodes.find((item) => item.id === nodeId)!
  return render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <AudioNodeV4 id={nodeId} data={target.data} selected={selected} />
    </NodeV4CanvasProvider>,
  )
}

describe('空卡 / 有声两态', () => {
  it('空卡是 72 高的虚线矮卡 + 一句「上传 · 或写台词生成」', () => {
    renderAudio(harness([audioNode('a_1')]))
    const card = document.querySelector('[data-node-chrome="card"]')!
    expect(card.getAttribute('data-empty')).toBe('true')
    const surface = card.querySelector(
      '[data-node-card-surface]',
    ) as HTMLElement
    expect(surface.style.height).toBe(`${AUDIO_CARD.height}px`)
    expect(screen.getByText('emptyHint')).toBeInTheDocument()
  })

  it('有声矮卡 = 波形 + 右侧时长 + 播放钮，卡高仍是 72', () => {
    renderAudio(
      harness([
        audioNode('a_1', { url: 'https://cdn.test/v.mp3', durationSec: 7 }),
      ]),
    )
    const surface = document.querySelector(
      '[data-audio-surface="ready"]',
    ) as HTMLElement
    // 内容层比卡高矮 2px：卡的 hairline 边叠在外面（见 `AUDIO_CARD.contentHeight`）。
    expect(surface.style.height).toBe(`${AUDIO_CARD.contentHeight}px`)
    expect(surface.querySelector('[data-audio-waveform]')).not.toBeNull()
    expect(screen.getByText('7s')).toBeInTheDocument()
    expect(document.querySelector('[data-audio-play]')).not.toBeNull()
  })

  it('生成中走一条进度线（矮卡例外），⛔ 不是描边环', () => {
    renderAudio(harness([audioNode('a_1', { mediaJobId: 'job_1' })]))
    const progress = document.querySelector(
      '[data-node-chrome="frame-progress"]',
    )
    expect(progress?.getAttribute('data-variant')).toBe('line')
  })

  it('波形柱按地址确定性生成 —— 同一段声音两次画出同一条', () => {
    expect(buildAudioWaveformBars('https://cdn.test/v.mp3')).toEqual(
      buildAudioWaveformBars('https://cdn.test/v.mp3'),
    )
    expect(buildAudioWaveformBars('a')).not.toEqual(buildAudioWaveformBars('b'))
  })
})

describe('选中态：工具条与提示词栏', () => {
  const selectedContext = () =>
    harness(
      [audioNode('a_1', { url: 'https://cdn.test/v.mp3', durationSec: 7 })],
      { selectedNodeIds: ['a_1'] },
    )

  it('工具条五键：加语气 · 转文字 · 生镜头 · 下载 · ⋯', () => {
    renderAudio(selectedContext(), 'a_1', true)
    const ids = Array.from(
      document.querySelectorAll('[data-toolbar-action]'),
    ).map((item) => item.getAttribute('data-toolbar-action'))
    expect(ids).toEqual(['tone', 'transcribe', 'shot', 'download', 'more'])
  })

  it('生镜头 = 一批两条：建镜头 + 把这段声音连成它的音轨', () => {
    const context = selectedContext()
    renderAudio(context, 'a_1', true)
    fireEvent.click(document.querySelector('[data-toolbar-action="shot"]')!)
    const ops = (context.onApplyBatch as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as readonly Record<string, unknown>[]
    expect(ops[0]).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: 'video',
      subtype: 'shot',
    })
    expect(ops[1]).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.connect,
      source: 'a_1',
      slot: 'voice',
    })
  })

  it('栏上只有两颗 chip：音色 · 模型', () => {
    const context = harness(
      [audioNode('a_1', { url: 'https://cdn.test/v.mp3' })],
      {
        selectedNodeIds: ['a_1'],
        modelOptionsByKind: {
          audio: [modelOption('opt_fish', AI_MODELS.FISH_AUDIO_S2_PRO)],
        },
      },
    )
    renderAudio(context, 'a_1', true)
    expect(document.querySelector('[data-audio-voice-chip]')).not.toBeNull()
    expect(document.querySelector('[data-audio-model-chip]')).not.toBeNull()
  })

  it('选了配乐模型：音色 chip 消失、占位文案换成描述', () => {
    const context = harness(
      [
        audioNode('a_1', {
          url: 'https://cdn.test/m.mp3',
          model: {
            optionId: 'opt_music',
            modelId: AI_MODELS.ELEVENLABS_MUSIC_V2,
            adapterType: 'elevenlabs',
            providerConfig: {},
          },
        }),
      ],
      {
        selectedNodeIds: ['a_1'],
        modelOptionsByKind: {
          audio: [modelOption('opt_music', AI_MODELS.ELEVENLABS_MUSIC_V2)],
        },
      },
    )
    renderAudio(context, 'a_1', true)
    expect(document.querySelector('[data-audio-voice-chip]')).toBeNull()
    expect(
      document
        .querySelector('[data-prompt-bar-input]')
        ?.getAttribute('placeholder'),
    ).toBe('promptPlaceholderMusic')
  })

  it('回车 = 发一次生成', () => {
    const context = selectedContext()
    renderAudio(context, 'a_1', true)
    const input = document.querySelector('[data-prompt-bar-input]')!
    fireEvent.change(input, { target: { value: '真正的告别' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(generateNode).toHaveBeenCalled()
  })

  it('退格删掉整颗行内标记，⛔ 不啃成半个方括号', () => {
    renderAudio(selectedContext(), 'a_1', true)
    const input = document.querySelector(
      '[data-prompt-bar-input]',
    ) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '[愤怒]台词' } })
    input.selectionStart = 4
    input.selectionEnd = 4
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(input.value).toBe('台词')
  })

  it('有标记时栏上多一行 chip 预览', () => {
    renderAudio(selectedContext(), 'a_1', true)
    const input = document.querySelector('[data-prompt-bar-input]')!
    expect(document.querySelector('[data-audio-line-chips]')).toBeNull()
    fireEvent.change(input, { target: { value: '[愤怒]台词' } })
    expect(
      document.querySelector('[data-audio-line-marker="愤怒"]'),
    ).not.toBeNull()
  })
})

describe('版本与快速听', () => {
  const withVersions = () =>
    harness(
      [
        audioNode('a_1', {
          url: 'https://cdn.test/v2.mp3',
          durationSec: 7,
          outputs: {
            cur: 1,
            versions: [
              { id: 'ov_1', url: 'https://cdn.test/v1.mp3', createdAt: NOW },
              { id: 'ov_2', url: 'https://cdn.test/v2.mp3', createdAt: NOW },
            ],
          },
        }),
      ],
      { selectedNodeIds: ['a_1'] },
    )

  it('两版 = 卡下两颗小点，点第一颗发 set_output_version', () => {
    const context = withVersions()
    renderAudio(context, 'a_1', true)
    const dots = document.querySelectorAll('[data-version-dot]')
    expect(dots).toHaveLength(2)
    fireEvent.click(dots[0]!)
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: 'a_1',
      index: 0,
    })
  })

  it('双击 = 快速听：大波形 + 只读台词，⛔ 无参数', () => {
    const context = harness([
      audioNode('a_1', {
        url: 'https://cdn.test/v.mp3',
        durationSec: 7,
        prompt: '[愤怒]把她还给我！',
      }),
    ])
    const { container } = renderAudio(context)
    fireEvent.doubleClick(container.firstElementChild!)
    const quick = document.querySelector('[data-audio-quick-listen]')!
    expect(quick).not.toBeNull()
    expect(quick.querySelector('[data-audio-waveform]')).not.toBeNull()
    expect(
      quick.querySelector('[data-audio-line-chips="plain"]'),
    ).not.toBeNull()
    expect(quick.querySelector('[data-audio-voice-chip]')).toBeNull()
  })
})

describe('音色弹层', () => {
  it('列出我的音色、每条可试听，选中写 voiceId', () => {
    const onSelectVoice = vi.fn()
    render(
      <AudioVoiceChip
        voiceId={undefined}
        speed={undefined}
        volume={undefined}
        onSelectVoice={onSelectVoice}
        onSpeedChange={vi.fn()}
        onVolumeChange={vi.fn()}
      />,
    )
    fireEvent.click(document.querySelector('[data-audio-voice-chip]')!)
    expect(
      document.querySelector('[data-audio-voice-row="fish_morning"]'),
    ).not.toBeNull()
    expect(
      document.querySelector('[data-audio-voice-preview="c1"]'),
    ).not.toBeNull()
    fireEvent.click(
      document.querySelector('[data-audio-voice-row="fish_morning"] button')!,
    )
    expect(onSelectVoice).toHaveBeenCalledWith({
      voiceId: 'fish_morning',
      name: '莫宁',
      sampleUrl: null,
    })
  })

  it('弹层底部是语速三档 + 音量滑杆（prosody，⛔ 不是标记）', () => {
    const onSpeedChange = vi.fn()
    render(
      <AudioVoiceChip
        voiceId="fish_morning"
        speed={1}
        volume={0}
        onSelectVoice={vi.fn()}
        onSpeedChange={onSpeedChange}
        onVolumeChange={vi.fn()}
      />,
    )
    fireEvent.click(document.querySelector('[data-audio-voice-chip]')!)
    const steps = document.querySelectorAll('[data-audio-voice-speed]')
    expect(
      Array.from(steps).map((s) => s.getAttribute('data-audio-voice-speed')),
    ).toEqual(['0.8', '1', '1.2'])
    expect(screen.getByText('volume')).toBeInTheDocument()
  })
})

describe('模型弹层：三组即三类', () => {
  it('按 audioKind 分组，空组不画', () => {
    const groups = audioModelGroups([
      modelOption('opt_fish', AI_MODELS.FISH_AUDIO_S2_PRO),
      modelOption('opt_music', AI_MODELS.ELEVENLABS_MUSIC_V2),
      modelOption('opt_sfx', AI_MODELS.ELEVENLABS_SFX_V2),
    ])
    expect(groups.map((group) => group.kind)).toEqual([
      'speech',
      'sfx',
      'music',
    ])

    const speechOnly = audioModelGroups([
      modelOption('opt_fish', AI_MODELS.FISH_AUDIO_S2_PRO),
    ])
    expect(speechOnly).toHaveLength(1)
  })

  it('选中一条配乐模型 → 这张卡就是配乐卡（音色 chip 随之消失）', () => {
    const onChange = vi.fn()
    render(
      <AudioModelChip
        options={[
          modelOption('opt_fish', AI_MODELS.FISH_AUDIO_S2_PRO),
          modelOption('opt_music', AI_MODELS.ELEVENLABS_MUSIC_V2),
        ]}
        value="opt_fish"
        onChange={onChange}
      />,
    )
    fireEvent.click(document.querySelector('[data-audio-model-chip]')!)
    expect(document.querySelectorAll('[data-audio-model-group]')).toHaveLength(
      2,
    )
    fireEvent.click(
      document.querySelector('[data-audio-model-option="opt_music"]')!,
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ optionId: 'opt_music' }),
    )

    const musicData = {
      kind: 'audio',
      model: { modelId: AI_MODELS.ELEVENLABS_MUSIC_V2 },
    } as never
    expect(resolveAudioNodeKind(musicData)).toBe('music')
    expect(showsVoiceChip(resolveAudioNodeKind(musicData))).toBe(false)
  })
})

describe('加语气浮层', () => {
  it('情绪 + 语气 + 强度 → 两颗标记，强度写进文本', () => {
    const onInsert = vi.fn()
    render(<AudioTonePopover onInsert={onInsert} />)
    fireEvent.click(document.querySelector('[data-tone-tag="emotion:愤怒"]')!)
    fireEvent.click(document.querySelector('[data-tone-tag="tone:咬牙切齿"]')!)
    fireEvent.click(document.querySelector('[data-tone-intensity="strong"]')!)
    fireEvent.click(document.querySelector('[data-tone-apply]')!)
    expect(onInsert).toHaveBeenCalledWith([
      { label: '愤怒', intensity: VOICE_MARKUP_INTENSITY_IDS.strong },
      { label: '咬牙切齿' },
    ])
  })

  it('自定义描述回车直接插一颗', () => {
    const onInsert = vi.fn()
    render(<AudioTonePopover onInsert={onInsert} />)
    const input = document.querySelector('[data-tone-custom]')!
    fireEvent.change(input, { target: { value: '像在憋着笑' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onInsert).toHaveBeenCalledWith([{ label: '像在憋着笑' }])
  })
})
