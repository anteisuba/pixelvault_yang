/**
 * 音频卡：真上传 hook、真生成 hook、真声音库（`useVoiceLibrary` / 640 面板）、真转写、
 * 真裁剪（`trimAudioToWav`）、真模型选择器、真卡面闪光。
 * 只假网络（`fakeServer`）、浏览器缺的那几样（`AudioContext` 解码、`ResizeObserver`、
 * 媒体播放）、React Flow 的画布量尺、Clerk 与 next-intl。
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))

vi.mock('@xyflow/react', () => ({
  // 工具条 / 提示词栏跟着画布缩放 —— 桩里固定 100%。
  useStore: <T,>(
    selector: (state: { transform: [number, number, number] }) => T,
  ) => selector({ transform: [0, 0, 1] }),
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

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" src={String(props.src)} />
  ),
}))

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { rememberVoiceCovers } from '@/hooks/use-voice-cover'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { VOICE_MARKUP_INTENSITY_IDS } from '@/lib/voice-markup'
import type { NodeV4, NodeWorkflowModelOption } from '@/types/node-workflow'

import {
  DropdownMenu,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu'

import { AudioNodeV4 } from './AudioNodeV4'
import { GROW_CLOSE_MS } from './chrome/use-grow-from-origin'
import { AudioOwnerMenuItem } from './audio/AudioOwnerMenuItem'
import { AudioTonePopover } from './audio/AudioTonePopover'
import { AudioVoiceChip } from './audio/AudioVoiceChip'
import { AudioWaveform } from './audio/AudioWaveform'
import {
  AUDIO_CARD,
  audioWaveformBarCount,
  buildAudioWaveformBars,
  formatAudioCardDuration,
  resolveAudioNodeKind,
  showsVoiceChip,
} from './audio/audio-node-model'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'
import { API_ENDPOINTS } from '@/constants/config'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { fakeServer } from '@/test/app-harness'

const NOW = '2026-09-10T00:00:00.000Z'

const ok = (data: unknown) => Response.json({ success: true, data })

function voiceCard(
  id: string,
  name: string,
  voiceId: string,
  patch: { referenceAudioUrl?: string | null; sampleAudioUrl?: string | null },
) {
  return {
    id,
    userId: 'u_1',
    name,
    provider: 'fish_audio',
    modelId: null,
    voiceId,
    coverImage: null,
    referenceAudioUrl: null,
    referenceAudioStorageKey: null,
    gender: null,
    age: null,
    tone: id === 'c1' ? ['低沉'] : [],
    pace: 'normal',
    pitch: null,
    pronunciationDictionary: {},
    sampleAudioUrl: null,
    sampleText: null,
    isDeleted: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  }
}

/** 我的音色：一副克隆的、同一副嗓子收藏了两次（真机：「林翩翩」各出现两遍）、一副当年没存示例的收藏。 */
const MY_VOICE_CARDS = [
  voiceCard('c1', '莫宁', 'fish_morning', {
    referenceAudioUrl: 'https://cdn.test/ref.mp3',
  }),
  voiceCard('f1', '旁白 · 标准', 'fish_narrator', {
    sampleAudioUrl: 'https://cdn.test/sample.mp3',
  }),
  voiceCard('f1b', '旁白 · 标准', 'fish_narrator', {}),
  voiceCard('f2', '安静', 'fish_quiet', {}),
]

const PUBLIC_VOICE = {
  id: 'fish_public',
  title: '西格莉卡',
  description: null,
  coverImage: null,
  state: 'trained',
  languages: ['zh'],
  tags: [],
  samples: [{ audio: 'https://cdn.test/public.mp3', text: '你好' }],
  likeCount: 0,
  taskCount: 0,
  visibility: 'public',
  createdAt: NOW,
  author: { id: 'p', nickname: '平台', avatar: null },
}

/** 每例的假服务端记下的请求体：断言「发出去的是什么」。 */
const sent = {
  generate: [] as Record<string, unknown>[],
  voiceSample: [] as Record<string, unknown>[],
  uploads: [] as File[],
}
/** 转写这一回回什么。 */
let transcribeText = '真正的告别'

beforeEach(() => {
  sent.generate = []
  sent.voiceSample = []
  sent.uploads = []
  transcribeText = '真正的告别'
  fakeServer()
    .on('GET', API_ENDPOINTS.API_KEYS, () => ok([]))
    .on('GET', API_ENDPOINTS.CHARACTER_CARDS, () => ok([]))
    .on('GET', API_ENDPOINTS.VOICE_CARDS, () =>
      ok({ items: MY_VOICE_CARDS, total: MY_VOICE_CARDS.length }),
    )
    .on('GET', '/api/voices', () => ok({ items: [PUBLIC_VOICE], total: 1 }))
    .on('POST', API_ENDPOINTS.VOICE_SAMPLE, async (request) => {
      const body = (await request.json()) as { voiceId: string }
      sent.voiceSample.push(body)
      return ok({ url: `https://cdn.test/owned/${body.voiceId}.mp3` })
    })
    .on('POST', '/api/voices/upload-reference', async (request) => {
      const file = (await request.formData()).get('audio') as File
      sent.uploads.push(file)
      return ok({
        url: 'https://cdn.test/up.mp3',
        sizeBytes: file.size,
        mimeType: file.type,
        fileName: file.name,
      })
    })
    .on('POST', '/api/voices/transcribe', () => ok({ text: transcribeText }))
    .on('POST', API_ENDPOINTS.GENERATE_AUDIO, async (request) => {
      sent.generate.push((await request.json()) as Record<string, unknown>)
      return Response.json(
        { success: false, error: 'provider down' },
        { status: 502 },
      )
    })
    // 卡上那一版的音频字节（CDN）：裁剪 / 转写都先取回来。
    .on(
      'GET',
      '/:file',
      () => new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } }),
    )
})

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
  // jsdom 没有 WebAudio：解码一律答「8 kHz 单声道、7 秒」，切段与编 WAV 走真代码。
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: class {
      async decodeAudioData() {
        const sampleRate = 8000
        const length = sampleRate * 7
        return {
          numberOfChannels: 1,
          sampleRate,
          duration: 7,
          length,
          getChannelData: () => new Float32Array(length),
        }
      }
      async close() {}
    },
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
  overrides: Partial<NodeWorkflowModelOption> = {},
): NodeWorkflowModelOption {
  return {
    optionId,
    modelId,
    adapterType: 'fish_audio',
    providerConfig: {},
    requestCount: 0,
    sourceType: 'workspace',
    ...overrides,
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
    // 卡在发送那一下读「op 之后的图」—— 测试里就是这份上下文自己的 nodes / edges。
    readGraph() {
      return { nodes: this.nodes, edges: this.edges }
    },
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(() => ({ createdNodeIds: ['t_1'] })),
    onTidyLayout: vi.fn(),
    onPlaceBeside: vi.fn(() => undefined),
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
  // 外面套一层 `.react-flow__node`（与画布里一样），卡面闪光才找得到这张卡。
  return renderInApp(
    <div className="react-flow__node" data-id={nodeId}>
      <NodeV4CanvasProvider value={context}>
        {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
        <AudioNodeV4 id={nodeId} data={target.data} selected={selected} />
      </NodeV4CanvasProvider>
    </div>,
  )
}

/** 卡上的模型选择器要真 key 列表（`ApiKeysProvider`）。 */
function renderInApp(ui: ReactElement) {
  return render(<ApiKeysProvider>{ui}</ApiKeysProvider>)
}

describe('空卡 / 有声两态', () => {
  it('空卡是 72 高的虚线矮卡 + 横排上传、声音库与下一步', () => {
    renderAudio(harness([audioNode('a_1')]))
    const card = document.querySelector('[data-node-chrome="card"]')!
    expect(card.getAttribute('data-empty')).toBe('true')
    const surface = card.querySelector(
      '[data-node-card-surface]',
    ) as HTMLElement
    expect(surface.style.height).toBe(`${AUDIO_CARD.height}px`)
    expect(surface).toHaveClass('border-dashed', 'bg-transparent')
    expect(screen.getByText('emptyNextStep')).toHaveClass(
      'text-muted-foreground/75',
    )
    expect(
      screen.getByRole('button', { name: 'chrome.emptyUpload' }),
    ).toHaveClass('h-7', 'px-2.75')
    expect(
      screen.getByRole('button', { name: 'emptyVoiceLibrary' }),
    ).toHaveClass('h-7', 'px-2.75')
  })

  it('选中空卡只有提示词栏；声音库字键打开现有面板', () => {
    renderAudio(
      harness([audioNode('a_1')], { selectedNodeIds: ['a_1'] }),
      'a_1',
      true,
    )
    expect(screen.queryByTestId('flow-toolbar-top')).toBeNull()
    expect(screen.getByTestId('flow-toolbar-bottom')).toBeInTheDocument()
    expect(document.querySelector('textarea')).toHaveAttribute(
      'placeholder',
      'promptPlaceholder',
    )
    fireEvent.click(document.querySelector('[data-node-empty-library]')!)
    expect(document.querySelector('[data-node-chrome="frame"]')).not.toBeNull()
  })

  it('文件拖进空卡时虚线变实线、填充加深', () => {
    renderAudio(harness([audioNode('a_1')]))
    const root = document.querySelector('[data-node-kind="audio"]')!
    const surface = document.querySelector('[data-node-card-surface]')!
    fireEvent.dragEnter(root, { dataTransfer: { types: ['Files'] } })
    expect(surface).toHaveClass('border-solid', 'bg-surface-fill-hover')
    fireEvent.dragLeave(root)
    expect(surface).toHaveClass('border-dashed', 'bg-transparent')
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
    expect(AUDIO_CARD.height).toBe(72)
    expect(surface.style.height).toBe('72px')
    expect(surface.querySelector('[data-audio-waveform]')).not.toBeNull()
    expect(screen.getByText('0:07')).toBeInTheDocument()
    expect(surface.querySelector('[data-audio-duration]')?.className).toContain(
      'w-9.5',
    )
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

  it('波形柱按可用宽度排满，时长使用固定宽度读数', () => {
    expect(audioWaveformBarCount(192)).toBe(38)
    expect(audioWaveformBarCount(193)).toBe(39)
    expect(audioWaveformBarCount(0)).toBe(0)
    expect(formatAudioCardDuration(72)).toBe('1:12')
  })

  it('30% 画布缩放的首帧按布局宽出柱，不使用已缩放的视觉宽', () => {
    const layoutWidth = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(192)
    const visualRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 57.6 } as DOMRect)
    try {
      const { container } = render(<AudioWaveform seed="clip" fitWidth />)
      expect(container.querySelector('[data-audio-waveform]')).toHaveAttribute(
        'data-bar-count',
        '38',
      )
    } finally {
      layoutWidth.mockRestore()
      visualRect.mockRestore()
    }
  })
})

describe('封面跟着嗓子走（owner 2026-09-29）', () => {
  it('从声音库「用这段」落进来的那一版：播放钮换成那副嗓子的封面', () => {
    rememberVoiceCovers([
      { voiceId: 'fish_cover', cover: 'https://cover.test/fish_cover.png' },
    ])
    renderAudio(
      harness([
        audioNode('a_1', {
          url: 'https://cdn.test/v.mp3',
          outputs: {
            cur: 0,
            versions: [
              {
                id: 'ov_1',
                url: 'https://cdn.test/v.mp3',
                createdAt: NOW,
                source: {
                  kind: 'platformSample',
                  label: '来自声音库 · 平台样本 · 秧秧',
                  voiceId: 'fish_cover',
                },
              },
            ],
          },
        }),
      ]),
      'a_1',
    )
    const play = document.querySelector('[data-audio-play]')!
    expect(play.getAttribute('data-audio-play')).toBe('cover')
    expect(play.querySelector('img')?.getAttribute('src')).toBe(
      'https://cover.test/fish_cover.png',
    )
  })

  it('没有封面的（上传 / 录音）照旧是普通播放钮', () => {
    renderAudio(
      harness([audioNode('a_1', { url: 'https://cdn.test/v.mp3' })]),
      'a_1',
    )
    const play = document.querySelector('[data-audio-play]')!
    expect(play.getAttribute('data-audio-play')).not.toBe('cover')
    expect(play.querySelector('img')).toBeNull()
  })
})

describe('选中态：工具条与提示词栏', () => {
  const selectedContext = () =>
    harness(
      [audioNode('a_1', { url: 'https://cdn.test/v.mp3', durationSec: 7 })],
      { selectedNodeIds: ['a_1'] },
    )

  it('工具条四个动作 + ⋯：加语气（带字）· 裁剪 · 转文字 · 连到镜头；下载收进 ⋯', () => {
    renderAudio(selectedContext(), 'a_1', true)
    const ids = Array.from(
      document.querySelectorAll('[data-toolbar-action]'),
    ).map((item) => item.getAttribute('data-toolbar-action'))
    expect(ids).toEqual(['tone', 'trim', 'transcribe', 'shot', 'more'])
    expect(
      document.querySelector('[data-toolbar-action="tone"]')!.textContent,
    ).toContain('toolbar.tone')
    openMenu('[data-toolbar-action="more"]')
    expect(
      document.querySelector('[data-audio-more="download"]'),
    ).not.toBeNull()
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

  it('裁剪确认 = 新建一张「· 裁剪」音频卡放原卡右侧，原卡原样不动（owner 2026-09-11）', async () => {
    const context = selectedContext()
    // 落点由画布给（右边第一个空位，§7 摆放 A「让位」）。
    context.onPlaceBeside = vi.fn(() => [{ x: 384, y: 0 }])
    renderAudio(context, 'a_1', true)
    fireEvent.click(document.querySelector('[data-toolbar-action="trim"]')!)
    fireEvent.click(document.querySelector('[data-audio-trim-confirm]')!)
    // 整段（0–7 秒）裁出来编成 WAV，走与手动上传同一条上传管线。
    await waitFor(() => expect(sent.uploads).toHaveLength(1))
    const wav = sent.uploads[0]!
    expect(wav.type).toBe('audio/wav')
    // 建卡走的是转文字那条同一条路：一条 add_node，名字「原名 · 裁剪」，落右侧。
    await waitFor(() => expect(context.onApplyBatch).toHaveBeenCalled())
    const ops = (context.onApplyBatch as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as readonly Record<string, unknown>[]
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: 'audio',
      subtype: 'voice',
      name: 'trim.derivedName:a_1',
    })
    expect(context.onPlaceBeside).toHaveBeenCalledWith('a_1', [
      { kind: 'audio', subtype: 'voice' },
    ])
    expect(ops[0]!.position).toEqual({ x: 384, y: 0 })
    // 媒体落在**新卡**上，来源写原卡名；⛔ 原卡一个字不动。
    await waitFor(() =>
      expect(context.onSetMedia).toHaveBeenCalledWith(
        't_1',
        expect.objectContaining({
          url: 'https://cdn.test/up.mp3',
          source: { kind: 'trim', label: 'a_1' },
        }),
      ),
    )
    expect(context.onSetMedia).not.toHaveBeenCalledWith(
      'a_1',
      expect.anything(),
    )
    // 建完自动选中新卡。
    expect(context.onFocusNode).toHaveBeenCalledWith('t_1')
    // ⛔ 这条路上一次生成都不该发。
    expect(sent.generate).toEqual([])
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
    // 点开：分组维度是类型（语音 / 配乐 / 音效），⛔ 不是系列。
    fireEvent.click(chip)
    expect(
      [...document.querySelectorAll('[data-picker-group]')].map((group) =>
        group.getAttribute('data-picker-group'),
      ),
    ).toEqual(['speech'])
  })

  it('未选模型时显示首个可用型号，生成提交也使用同一型号', async () => {
    const locked = modelOption('opt_locked', AI_MODELS.FISH_AUDIO_S2_PRO)
    const runnable = modelOption('opt_music', AI_MODELS.ELEVENLABS_MUSIC_V2, {
      adapterType: AI_ADAPTER_TYPES.ELEVENLABS,
      sourceType: 'saved',
      apiKeyId: 'key_music',
    })
    const context = harness(
      [audioNode('a_1', { url: 'https://cdn.test/v.mp3' })],
      {
        selectedNodeIds: ['a_1'],
        modelOptionsByKind: { audio: [locked, runnable] },
      },
    )
    renderAudio(context, 'a_1', true)
    // chip 上写的就是那条能跑的配乐型号（⛔ 不是排第一、被锁住的那条）。
    expect(
      document.querySelector('[data-model-chip]')!.getAttribute('title'),
    ).toBe('elevenMusicV2.label')
    expect(document.querySelector('[data-audio-voice-chip]')).toBeNull()
    const input = document.querySelector('[data-prompt-bar-input]')!
    expect(input).toHaveAttribute('placeholder', 'promptPlaceholderMusic')
    fireEvent.change(input, { target: { value: '柔和的旋律' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const selection = {
      optionId: runnable.optionId,
      modelId: runnable.modelId,
      adapterType: runnable.adapterType,
      providerConfig: runnable.providerConfig,
      apiKeyId: runnable.apiKeyId,
    }
    expect(context.onSetModel).toHaveBeenCalledWith('a_1', selection)
    // 发出去的生成请求用的就是这同一型号、同一把 key。
    await waitFor(() => expect(sent.generate).toHaveLength(1))
    expect(sent.generate[0]).toMatchObject({
      modelId: AI_MODELS.ELEVENLABS_MUSIC_V2,
      apiKeyId: 'key_music',
      prompt: '柔和的旋律',
    })
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

  it('回车 = 发一次生成', async () => {
    const context = harness(
      [audioNode('a_1', { url: 'https://cdn.test/v.mp3', durationSec: 7 })],
      {
        selectedNodeIds: ['a_1'],
        modelOptionsByKind: {
          audio: [modelOption('opt_fish', AI_MODELS.FISH_AUDIO_S2_PRO)],
        },
      },
    )
    renderAudio(context, 'a_1', true)
    const input = document.querySelector('[data-prompt-bar-input]')!
    fireEvent.change(input, { target: { value: '真正的告别' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(sent.generate).toHaveLength(1))
    expect(sent.generate[0]).toMatchObject({ prompt: '真正的告别' })
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

/** 音色弹层开了才去拉我的音色（`GET /api/voice-cards`）。 */
async function waitForVoiceRows() {
  await waitFor(() =>
    expect(
      document.querySelector('[data-audio-voice-row="fish_morning"]'),
    ).not.toBeNull(),
  )
}

describe('音色弹层', () => {
  it('列出我的音色、每条可试听，选中写 voiceId', async () => {
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
    await waitForVoiceRows()
    expect(
      document.querySelector('[data-audio-voice-preview="fish_morning"]'),
    ).not.toBeNull()
    // 行首头像是试听键；点名字那一块才是选中。
    fireEvent.click(
      document.querySelector(
        '[data-audio-voice-row="fish_morning"] button:not([data-audio-voice-preview])',
      )!,
    )
    expect(onSelectVoice).toHaveBeenCalledWith({
      voiceId: 'fish_morning',
      name: '莫宁',
      sampleUrl: null,
    })
  })

  it('同一副嗓子只列一行；收藏的写「收藏的」，⛔ 一律写成「我克隆的」', async () => {
    render(
      <AudioVoiceChip
        voiceId={undefined}
        voiceName={undefined}
        speed={undefined}
        volume={undefined}
        onSelectVoice={vi.fn()}
        onSpeedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onOpenLibrary={vi.fn()}
      />,
    )
    fireEvent.click(document.querySelector('[data-audio-voice-chip]')!)
    await waitForVoiceRows()
    expect(
      document.querySelectorAll('[data-audio-voice-row="fish_narrator"]'),
    ).toHaveLength(1)
    expect(
      document.querySelector('[data-audio-voice-row="fish_narrator"]')!
        .textContent,
    ).toContain('favorited')
    expect(
      document.querySelector('[data-audio-voice-row="fish_morning"]')!
        .textContent,
    ).toContain('cloned')
    // 收藏的没存示例也按得动试听（带 voiceId 就能现取）。
    expect(
      document
        .querySelector('[data-audio-voice-preview="fish_quiet"]')!
        .hasAttribute('disabled'),
    ).toBe(false)
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

  it('换了音色：名字交叉淡换（120），旧名退场时脱开排版，退完只剩新名', async () => {
    const chip = (voiceId: string, voiceName: string) => (
      <AudioVoiceChip
        voiceId={voiceId}
        voiceName={voiceName}
        speed={undefined}
        volume={undefined}
        onSelectVoice={vi.fn()}
        onSpeedChange={vi.fn()}
        onVolumeChange={vi.fn()}
        onOpenLibrary={vi.fn()}
      />
    )
    const labels = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-audio-voice-chip-label]'),
      )
    const { rerender } = render(chip('fish_a', '甲'))
    // 头一回挂上不淡入（直接落在终态）。
    expect(labels().map((el) => el.style.opacity)).toEqual(['1'])
    rerender(chip('fish_b', '乙'))
    const incoming = labels().find((el) => el.textContent === '乙')!
    expect(incoming.style.opacity).toBe('0')
    await waitFor(() =>
      expect(labels().map((el) => el.textContent)).toEqual(['乙']),
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
    // A1 分段条（owner 2026-10-08 画布换皮）：三档是一组 radio。
    const steps = within(
      screen.getByRole('radiogroup', { name: 'speed' }),
    ).getAllByRole('radio')
    expect(steps.map((s) => s.textContent)).toEqual(['0.8×', '1.0×', '1.2×'])
    expect(steps[1]).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('volume')).toBeInTheDocument()
  })
})

/** 假时钟下一拍一拍往前推，直到条件成立（请求回包是微任务，防抖 / 动画是定时器）。 */
async function advanceUntil(done: () => boolean, stepMs = 10) {
  for (let step = 0; step < 50 && !done(); step += 1) {
    await act(() => vi.advanceTimersByTimeAsync(stepMs))
  }
  expect(done()).toBe(true)
}

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

  it('+ 菜单三项：上传 ⌘U · 从素材库选… · 声音库…（⛔ @，owner 2026-09-29）', () => {
    renderAudio(clip(), 'a_1', true)
    openMenu('[data-prompt-bar-add]')
    expect(
      Array.from(document.querySelectorAll('[data-audio-add]')).map((item) =>
        item.getAttribute('data-audio-add'),
      ),
    ).toEqual(['upload', 'library', 'voices'])
  })

  /*
   * ⚠ 两件事并在一例：「用这段」会排一颗 GROW_CLOSE_MS 后的闪光定时器，它按 data-id
   * 在**整页**找卡；分成两例时前一例的定时器会闪到后一例的卡上。这里全程假时钟。
   */
  it('「声音库…」开 640 面板；「用这段」先转存再落成一版并记来源（⛔ 不生成）；框缩回（GROW_CLOSE_MS）后卡面闪一下', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const context = clip()
      renderAudio(context, 'a_1', true)
      const surface = document.querySelector('[data-node-card-surface]')!
      openMenu('[data-prompt-bar-add]')
      fireEvent.click(document.querySelector('[data-audio-add="voices"]')!)
      expect(
        document.querySelector('[data-node-chrome="frame"]'),
      ).not.toBeNull()
      await advanceUntil(
        () => document.querySelector('[data-voice-library-use]') !== null,
      )
      fireEvent.click(document.querySelector('[data-voice-library-use]')!)
      // 转存是一条请求（只有微任务），⛔ 不推时钟。
      await advanceUntil(
        () => vi.mocked(context.onSetMedia).mock.calls.length > 0,
        0,
      )
      // 平台样本的地址（Fish 常给一小时就过期的签名链接）⛔ 原样落卡 —— 落的是转存后的那份。
      expect(sent.voiceSample).toEqual([{ voiceId: 'fish_public' }])
      expect(context.onSetMedia).toHaveBeenCalledWith(
        'a_1',
        expect.objectContaining({
          url: 'https://cdn.test/owned/fish_public.mp3',
          source: expect.objectContaining({ kind: 'platformSample' }),
        }),
      )
      expect(sent.generate).toEqual([])
      // 框还在缩回去：卡面先不闪。
      expect(surface).not.toHaveClass('node-assistant-touched')
      await act(() => vi.advanceTimersByTimeAsync(GROW_CLOSE_MS - 1))
      expect(surface).not.toHaveClass('node-assistant-touched')
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(surface).toHaveClass('node-assistant-touched')
    } finally {
      vi.useRealTimers()
    }
  })

  it('面板的「设为音色」写 voiceProfile，⛔ 不落产物', async () => {
    // 名字是新建时的默认名（机器起的）。
    const context = clip({ name: '语音3' })
    renderAudio(context, 'a_1', true)
    openMenu('[data-prompt-bar-add]')
    fireEvent.click(document.querySelector('[data-audio-add="voices"]')!)
    fireEvent.click(
      await waitFor(() => {
        const found = document.querySelector('[data-voice-library-set-voice]')
        expect(found).not.toBeNull()
        return found!
      }),
    )
    expect(context.onApplyBatch).toHaveBeenCalledWith([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile,
        target: 'a_1',
        profile: { voiceId: 'fish_public', voiceName: '西格莉卡' },
      },
      // 名字还是机器起的 → 同一批改成「音色名 · 语音 N」。
      expect.objectContaining({
        op: NODE_ASSISTANT_OP_V4_IDS.setField,
        field: 'name',
        value: '西格莉卡 · 语音 1',
      }),
      expect.objectContaining({
        op: NODE_ASSISTANT_OP_V4_IDS.setField,
        field: 'nameEdited',
        value: false,
      }),
    ])
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
    ).toEqual([
      'rename',
      'duplicate',
      'download',
      'split',
      'owner',
      'source',
      'delete',
    ])
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
    fireEvent.click(
      screen
        .getAllByRole('radio')
        .find((node) => node.textContent === 'intensities.strong')!,
    )
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

describe('名字行「→ 镜 3 · 4.0s / 3.6s」（node-canvas-v2 §4，owner 11-03）', () => {
  const shotCard = (id: string, shotNo: number, durationSec: number) =>
    ({
      id,
      position: { x: 400, y: shotNo * 100 },
      data: {
        kind: 'video',
        subtype: 'shot',
        name: id,
        shotNo,
        durationSec,
        status: 'idle',
        createdAt: NOW,
      },
    }) as NodeV4
  const voiceEdge = (target: string, source = 'a_1') => ({
    id: `e_${target}`,
    source,
    sourceHandle: 'out' as const,
    target,
    slot: 'voice' as const,
  })

  it('连了几镜：写第一镜 +「等 N 镜」；任一镜差超 0.5s 转琥珀；点它平移到第一镜', () => {
    const context = harness(
      [
        audioNode('a_1', { url: 'https://cdn.test/v.mp3', durationSec: 4 }),
        shotCard('s_5', 5, 5),
        shotCard('s_3', 3, 3.6),
      ],
      { edges: [voiceEdge('s_5'), voiceEdge('s_3')] },
    )
    renderAudio(context)
    const link = document.querySelector('[data-audio-shot-link]')!
    expect(link.textContent).toBe(
      'shotLink.shot:3 · 4.0s / 3.6s shotLink.more:1',
    )
    expect(link.getAttribute('data-mismatch')).toBe('true')
    expect(link).toHaveClass('text-status-warning', 'ml-auto')
    fireEvent.click(link)
    expect(context.onFocusNode).toHaveBeenCalledWith('s_3')
  })

  it('差在 0.5s 以内是平常灰字；没连镜头就不写', () => {
    const { unmount } = renderAudio(
      harness(
        [
          audioNode('a_1', { url: 'https://cdn.test/v.mp3', durationSec: 4 }),
          shotCard('s_3', 3, 3.6),
        ],
        { edges: [voiceEdge('s_3')] },
      ),
    )
    const link = document.querySelector('[data-audio-shot-link]')!
    expect(link.textContent).toBe('shotLink.shot:3 · 4.0s / 3.6s')
    expect(link.getAttribute('data-mismatch')).toBe('false')
    expect(link).toHaveClass('text-muted-foreground')
    unmount()

    renderAudio(harness([audioNode('a_1', { durationSec: 4 })]))
    expect(document.querySelector('[data-audio-shot-link]')).toBeNull()
  })
})
