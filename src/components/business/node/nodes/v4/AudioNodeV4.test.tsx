import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))

vi.mock('@xyflow/react', () => ({
  // S6e：卡壳从 RF 拿自己的 id（拖线反馈）。桩里给一个固定值就够。
  useNodeId: () => 'node-1',
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

/**
 * 切采样与编 WAV 的本体在 `src/lib/audio-trim.ts`（那边有逐字段的 WAV 头测试）——
 * 这一组要看的是**卡上那条路**：面板吐一对入出点 → 走上传 → 落成新一版。
 */
const trimSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/audio-trim', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio-trim')>()),
  trimAudioToWav: trimSpy,
}))

const generateNode = vi.fn(async () => ({ success: false as const }))
/** 转写本体在服务端（`/api/voices/transcribe`）；这里只关心卡上那一批 op。 */
const transcribeSpy = vi.hoisted(() => vi.fn())
vi.mock('./audio/audio-transcribe', () => ({
  transcribeAudioUrl: transcribeSpy,
}))
vi.mock('@/hooks/node/use-node-media-generation-v4', () => ({
  useNodeMediaGenerationV4: () => ({ generateNode, isLoading: false }),
}))

const setSearchSpy = vi.hoisted(() => vi.fn())
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
    publicVoices: [
      {
        id: 'fish_audio:fish_public',
        voiceId: 'fish_public',
        title: '西格莉卡',
        author: '平台',
        sampleUrl: 'https://cdn.test/public.mp3',
      },
    ],
    setSearch: setSearchSpy,
    setTab: vi.fn(),
    isLoading: false,
  }),
  isClonedVoiceCard: (card: { referenceAudioUrl: string | null }) =>
    Boolean(card.referenceAudioUrl),
}))

/** 模型弹层本体在 `ModelPickerPopover.test.tsx` 里测（分组、渠道、缺 key）；
 *  这里只关心「音频栏摆的是它、分组维度是 kind」。 */
vi.mock('../../../studio-shared/pickers/ModelPickerPopover', () => ({
  MODEL_PICKER_GROUP_BY: { series: 'series', kind: 'kind' },
  ModelPickerPopover: (props: Record<string, unknown>) => (
    <button
      type="button"
      data-model-chip
      data-group-by={String(props.groupBy)}
      data-count={(props.options as unknown[]).length}
    />
  ),
}))

vi.mock('../../FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: () => <div data-testid="voice-library-dialog" />,
}))

import { AI_MODELS } from '@/constants/models'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { VOICE_MARKUP_INTENSITY_IDS } from '@/lib/voice-markup'
import type { NodeV4, NodeWorkflowModelOption } from '@/types/node-workflow'

import {
  DropdownMenu,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu'

import { AudioNodeV4 } from './AudioNodeV4'
import { AudioOwnerMenuItem } from './audio/AudioOwnerMenuItem'
import { AudioTonePopover } from './audio/AudioTonePopover'
import { AudioVoiceChip } from './audio/AudioVoiceChip'
import {
  AUDIO_CARD,
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
    onApplyBatch: vi.fn(() => ({ createdNodeIds: ['t_1'] })),
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
  it('空卡是 72 高的虚线矮卡 + 一句「上传 · 选一段现成的 · 或写台词生成」', () => {
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

  it('工具条六键：加语气 · 裁剪 · 转文字 · 连到镜头 · 下载 · ⋯', () => {
    renderAudio(selectedContext(), 'a_1', true)
    const ids = Array.from(
      document.querySelectorAll('[data-toolbar-action]'),
    ).map((item) => item.getAttribute('data-toolbar-action'))
    expect(ids).toEqual([
      'tone',
      'trim',
      'transcribe',
      'shot',
      'download',
      'more',
    ])
  })

  it('连到镜头弹层顶行「新建镜头」= 原来那一批两条（建镜头 + 连成音轨）', () => {
    const context = selectedContext()
    renderAudio(context, 'a_1', true)
    fireEvent.click(document.querySelector('[data-toolbar-action="shot"]')!)
    fireEvent.click(document.querySelector('[data-connect-to-shot-new]')!)
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

  it('裁剪 = 卡下方那条栏换成裁剪条，Esc 退回提示词栏（画板 2026-09-10：已无「取消」键）', () => {
    renderAudio(selectedContext(), 'a_1', true)
    expect(
      document.querySelector('[data-node-chrome="prompt-bar"]'),
    ).not.toBeNull()
    fireEvent.click(document.querySelector('[data-toolbar-action="trim"]')!)
    expect(document.querySelector('[data-audio-trim-panel]')).not.toBeNull()
    expect(document.querySelector('[data-node-chrome="prompt-bar"]')).toBeNull()
    expect(document.querySelector('[data-audio-trim-cancel]')).toBeNull()
    fireEvent.keyDown(document.querySelector('[data-audio-trim-panel]')!, {
      key: 'Escape',
    })
    expect(document.querySelector('[data-audio-trim-panel]')).toBeNull()
    expect(
      document.querySelector('[data-node-chrome="prompt-bar"]'),
    ).not.toBeNull()
  })

  it('「裁剪为新版本」= 切出来的 WAV 走上传落成新一版，原音留作上一版（⛔ 不生成、不扣积分）', async () => {
    trimSpy.mockResolvedValueOnce({ blob: new Blob(['wav']) })
    const context = selectedContext()
    renderAudio(context, 'a_1', true)
    fireEvent.click(document.querySelector('[data-toolbar-action="trim"]')!)
    fireEvent.click(document.querySelector('[data-audio-trim-confirm]')!)
    await waitFor(() => expect(uploadFn).toHaveBeenCalled())
    expect(trimSpy).toHaveBeenCalledWith('https://cdn.test/v.mp3', {
      startSec: 0,
      endSec: 7,
    })
    await waitFor(() =>
      expect(context.onSetMedia).toHaveBeenCalledWith(
        'a_1',
        expect.objectContaining({
          url: 'https://cdn.test/up.mp3',
          source: expect.objectContaining({ kind: 'trim' }),
        }),
      ),
    )
    // ⛔ 这条路上一次生成都不该发。
    expect(generateNode).not.toHaveBeenCalled()
    // 裁完面板收起来，栏回到提示词。
    await waitFor(() =>
      expect(document.querySelector('[data-audio-trim-panel]')).toBeNull(),
    )
  })

  it('连到画布上已有的镜头：占着的 voice 槽先断旧边再连，连完滚到目标卡', async () => {
    const context = harness(
      [
        audioNode('a_1', { url: 'https://cdn.test/v.mp3', durationSec: 7 }),
        {
          id: 's_1',
          position: { x: 400, y: 0 },
          data: {
            kind: 'video',
            subtype: 'shot',
            name: '车站外',
            shotNo: 1,
            status: 'idle',
            createdAt: NOW,
          },
        } as NodeV4,
      ],
      {
        selectedNodeIds: ['a_1'],
        edges: [
          {
            id: 'e_old',
            source: 'a_0',
            sourceHandle: 'out',
            target: 's_1',
            slot: 'voice',
          },
        ],
      },
    )
    renderAudio(context, 'a_1', true)
    fireEvent.click(document.querySelector('[data-toolbar-action="shot"]')!)
    // 槽被占着 —— 那一行写「替换」而不是静默覆盖。
    expect(
      document.querySelector('[data-connect-to-shot-occupied]'),
    ).not.toBeNull()
    fireEvent.click(
      document.querySelector('[data-connect-to-shot-connect="s_1"]')!,
    )
    const ops = (context.onApplyBatch as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as readonly Record<string, unknown>[]
    expect(ops).toEqual([
      { op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: 'e_old' },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: 'a_1',
        target: 's_1',
        slot: 'voice',
      },
    ])
    await waitFor(() => expect(context.onFocusNode).toHaveBeenCalledWith('s_1'))
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
    // 模型 chip = 共用的 `ModelPickerPopover`（chip 就是它的 `ModelChip` 触发器），
    // 分组维度换成类型（语音 / 配乐 / 音效）。
    const chip = document.querySelector('[data-model-chip]')!
    expect(chip).not.toBeNull()
    expect(chip.getAttribute('data-group-by')).toBe('kind')
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

  it('行内标记 chip 画在**输入框里**（overlay），⛔ 不是栏上另一行', () => {
    renderAudio(selectedContext(), 'a_1', true)
    const input = document.querySelector('[data-prompt-bar-input]')!
    expect(document.querySelector('[data-audio-line-chips]')).toBeNull()
    fireEvent.change(input, { target: { value: '[强·愤怒]台词' } })
    const overlay = document.querySelector('[data-prompt-bar-overlay]')!
    const chip = overlay.querySelector('[data-prompt-bar-mark="tone:愤怒"]')!
    expect(chip).not.toBeNull()
    // 强 = 实心；chip 上只写标签，强度全称进 title（画板）。
    expect(chip.className).toContain('bg-primary')
    expect(chip.getAttribute('title')).toBe('tone.chipTitle:强/愤怒')
    // ⚠ overlay 的字符必须与 value 逐字符相同，否则光标错位。
    expect(overlay.textContent).toBe('[强·愤怒]台词')
  })

  it('三档强度 = 三种 chip 形态（强实心 / 中灰底 / 轻描边）', () => {
    renderAudio(selectedContext(), 'a_1', true)
    const input = document.querySelector('[data-prompt-bar-input]')!
    fireEvent.change(input, {
      target: { value: '[强·愤怒][愤怒][轻·愤怒]' },
    })
    const marks = Array.from(
      document.querySelectorAll('[data-prompt-bar-mark="tone:愤怒"]'),
    ).map((item) => item.className)
    expect(marks[0]).toContain('bg-primary')
    expect(marks[1]).toContain('bg-surface-fill')
    expect(marks[2]).toContain('ring-border')
  })

  it('@ 引用也在输入框里成 chip，退格整颗删', () => {
    const context = harness(
      [
        audioNode('a_1', { url: 'https://cdn.test/v.mp3' }),
        audioNode('a_2', { name: '莫宁' }),
      ],
      { selectedNodeIds: ['a_1'] },
    )
    renderAudio(context, 'a_1', true)
    const input = document.querySelector(
      '[data-prompt-bar-input]',
    ) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '@莫宁' } })
    expect(
      document.querySelector('[data-prompt-bar-mark="mention"]'),
    ).not.toBeNull()
    input.selectionStart = 3
    input.selectionEnd = 3
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(input.value).toBe('')
  })

  it('时长未知恒显 `--:--`，⛔ 不整块不画、⛔ 不写 0s', () => {
    renderAudio(harness([audioNode('a_1', { url: 'https://cdn.test/v.mp3' })]))
    const readout = document.querySelector('[data-audio-duration]')!
    expect(readout.getAttribute('data-known')).toBe('false')
    expect(readout.textContent).toBe('durationUnknown')
  })

  it('⋯ 菜单里有「归属角色…」', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <AudioOwnerMenuItem
            value={undefined}
            candidates={['莫宁', '西格莉卡']}
            onChange={vi.fn()}
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    expect(document.querySelector('[data-audio-more="owner"]')).not.toBeNull()
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

  it('⛔ 双击不再有快速听（spec §4 v2）', () => {
    const context = harness([
      audioNode('a_1', {
        url: 'https://cdn.test/v.mp3',
        durationSec: 7,
        prompt: '[愤怒]把她还给我！',
      }),
    ])
    const { container } = renderAudio(context)
    fireEvent.doubleClick(container.firstElementChild!)
    expect(document.querySelector('[data-audio-quick-listen]')).toBeNull()
    expect(document.querySelector('[data-node-chrome="quick-look"]')).toBeNull()
  })

  it('⛔ 悬停不自动播：`<audio>` 保持 paused', () => {
    renderAudio(
      harness([
        audioNode('a_1', { url: 'https://cdn.test/v.mp3', durationSec: 7 }),
      ]),
    )
    const surface = document.querySelector('[data-audio-surface="ready"]')!
    const el = document.querySelector('audio') as HTMLAudioElement
    const play = vi.spyOn(el, 'play')
    fireEvent.mouseEnter(surface)
    expect(play).not.toHaveBeenCalled()
  })

  it('播放钮常驻（⛔ 不再靠悬停淡入），点一下调 play', () => {
    renderAudio(
      harness([
        audioNode('a_1', { url: 'https://cdn.test/v.mp3', durationSec: 7 }),
      ]),
    )
    const button = document.querySelector('[data-audio-play]')!
    expect(button.className).not.toContain('opacity-0')
    expect(button.getAttribute('data-playing')).toBe('false')
    const el = document.querySelector('audio') as HTMLAudioElement
    const play = vi
      .spyOn(el, 'play')
      .mockImplementation(() => Promise.resolve())
    fireEvent.click(button)
    expect(play).toHaveBeenCalled()
  })
})

describe('音色弹层', () => {
  it('列出我的音色、每条可试听，选中写 voiceId', () => {
    const onSelectVoice = vi.fn()
    render(
      <AudioVoiceChip
        voiceId={undefined}
        voiceName={undefined}
        speed={undefined}
        volume={undefined}
        onSelectVoice={onSelectVoice}
        onSpeedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onOpenLibrary={vi.fn()}
      />,
    )
    fireEvent.click(document.querySelector('[data-audio-voice-chip]')!)
    expect(
      document.querySelector('[data-audio-voice-row="fish_morning"]'),
    ).not.toBeNull()
    expect(
      document.querySelector('[data-audio-voice-preview="fish_morning"]'),
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

  it('缩短成一段「我的音色」+「更多…」（⛔ 平台整库进 640 面板）', () => {
    const onOpenLibrary = vi.fn()
    render(
      <AudioVoiceChip
        voiceId={undefined}
        voiceName={undefined}
        speed={undefined}
        volume={undefined}
        onSelectVoice={vi.fn()}
        onSpeedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onOpenLibrary={onOpenLibrary}
      />,
    )
    fireEvent.click(document.querySelector('[data-audio-voice-chip]')!)
    expect(
      Array.from(document.querySelectorAll('[data-audio-voice-section]')).map(
        (item) => item.getAttribute('data-audio-voice-section'),
      ),
    ).toEqual(['mine'])
    // 平台整库那一段与它的搜索框都不在弹层里了。
    expect(
      document.querySelector('[data-audio-voice-row="fish_public"]'),
    ).toBeNull()
    expect(document.querySelector('[data-audio-voice-search]')).toBeNull()
    fireEvent.click(document.querySelector('[data-audio-voice-library]')!)
    expect(onOpenLibrary).toHaveBeenCalled()
  })

  it('收起时读名字快照（⛔ 不显示 voiceId 哈希）', () => {
    render(
      <AudioVoiceChip
        voiceId="fish_unknown_hash"
        voiceName="Super Smash Bros. 4/Ultimate Announcer"
        speed={undefined}
        volume={undefined}
        onSelectVoice={vi.fn()}
        onSpeedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onOpenLibrary={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-audio-voice-chip]')!.textContent).toBe(
      'Super Smash Bros. 4/Ultimate Announcer',
    )
  })

  it('弹层底部是语速三档 + 音量滑杆（prosody，⛔ 不是标记）', () => {
    const onSpeedChange = vi.fn()
    render(
      <AudioVoiceChip
        voiceId="fish_morning"
        voiceName="莫宁"
        speed={1}
        volume={0}
        onSelectVoice={vi.fn()}
        onSpeedChange={onSpeedChange}
        onVolumeChange={vi.fn()}
        onOpenLibrary={vi.fn()}
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

/** Radix 的 DropdownMenu 认 `pointerdown`，⛔ 不是 click。 */
function openMenu(selector: string) {
  fireEvent.pointerDown(document.querySelector(selector)!, {
    button: 0,
    ctrlKey: false,
  })
}

describe('S5c v2：+ 菜单 / ⋯ 菜单 / 转文字', () => {
  const clip = (patch: Record<string, unknown> = {}) =>
    harness(
      [
        audioNode('a_1', {
          url: 'https://cdn.test/v.mp3',
          durationSec: 7,
          ...patch,
        }),
      ],
      { selectedNodeIds: ['a_1'] },
    )

  it('+ 菜单四项：上传 ⌘U · 从素材库选… · 声音库… · @', () => {
    renderAudio(clip(), 'a_1', true)
    openMenu('[data-prompt-bar-add]')
    expect(
      Array.from(document.querySelectorAll('[data-audio-add]')).map((item) =>
        item.getAttribute('data-audio-add'),
      ),
    ).toEqual(['upload', 'library', 'voices', 'mention'])
  })

  it('「声音库…」开 640 面板；面板的「用这段」落成一版并记来源，⛔ 不生成', () => {
    generateNode.mockClear()
    const context = clip()
    renderAudio(context, 'a_1', true)
    openMenu('[data-prompt-bar-add]')
    fireEvent.click(document.querySelector('[data-audio-add="voices"]')!)
    const use = document.querySelector('[data-voice-library-use]')
    expect(document.querySelector('[data-node-chrome="frame"]')).not.toBeNull()
    expect(use).not.toBeNull()
    fireEvent.click(use!)
    expect(context.onSetMedia).toHaveBeenCalledWith(
      'a_1',
      expect.objectContaining({
        url: 'https://cdn.test/public.mp3',
        source: expect.objectContaining({ kind: 'platformSample' }),
      }),
    )
    expect(generateNode).not.toHaveBeenCalled()
  })

  it('面板的「设为音色」写 voiceProfile，⛔ 不落产物', () => {
    const context = clip()
    renderAudio(context, 'a_1', true)
    openMenu('[data-prompt-bar-add]')
    fireEvent.click(document.querySelector('[data-audio-add="voices"]')!)
    fireEvent.click(document.querySelector('[data-voice-library-set-voice]')!)
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile,
      target: 'a_1',
      profile: { voiceId: 'fish_public', voiceName: '西格莉卡' },
    })
  })

  it('⋯ 菜单：改名 · 复制 · 拆出当前版本 · 归属角色 · 来源（只读）· 删除', () => {
    const context = clip({
      outputs: {
        cur: 1,
        versions: [
          { id: 'ov_1', url: 'https://cdn.test/v0.mp3', createdAt: NOW },
          {
            id: 'ov_2',
            url: 'https://cdn.test/v.mp3',
            createdAt: NOW,
            source: { kind: 'platformSample', label: '来自声音库 · 莫宁' },
          },
        ],
      },
    })
    renderAudio(context, 'a_1', true)
    openMenu('[data-toolbar-action="more"]')
    expect(
      Array.from(document.querySelectorAll('[data-audio-more]')).map((item) =>
        item.getAttribute('data-audio-more'),
      ),
    ).toEqual(['rename', 'duplicate', 'split', 'owner', 'source', 'delete'])
    // 来源是**这一版**的那一行只读小字。
    expect(
      document.querySelector('[data-audio-more="source"]')!.textContent,
    ).toContain('来自声音库 · 莫宁')
  })

  it('只有一版时⛔ 不摆「拆出当前版本」', () => {
    renderAudio(clip(), 'a_1', true)
    openMenu('[data-toolbar-action="more"]')
    expect(document.querySelector('[data-audio-more="split"]')).toBeNull()
  })

  it('转文字 = 派生一张文本卡并连线指回；转写中卡上走进度线', async () => {
    transcribeSpy.mockResolvedValueOnce({ ok: true, text: '真正的告别' })
    const context = clip()
    renderAudio(context, 'a_1', true)
    fireEvent.click(
      document.querySelector('[data-toolbar-action="transcribe"]')!,
    )
    // 转写中：矮卡例外那条进度线（与生成中同一件）。
    expect(document.querySelector('[data-audio-transcribing]')).not.toBeNull()
    await waitFor(() => expect(context.onApplyBatch).toHaveBeenCalled())
    const ops = (context.onApplyBatch as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as readonly Record<string, unknown>[]
    expect(ops[0]).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: 'text',
      subtype: 'script',
    })
    expect(ops[1]).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.setText,
      body: '真正的告别',
    })
    expect(ops[2]).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.connect,
      target: 'a_1',
      slot: 'text',
    })
    // 转完自动选中新卡。
    await waitFor(() => expect(context.onFocusNode).toHaveBeenCalledWith('t_1'))
  })
})

describe('模型弹层：三组即三类', () => {
  it('选中一条配乐模型 → 这张卡就是配乐卡（音色 chip 随之消失）', () => {
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
