import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import {
  NODE_STUDIO_VOICE_CLIP_SOURCE_IDS,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const {
  uploadReferenceAudioAPI,
  generateAudioAPI,
  checkAudioStatusAPI,
  getVoiceAPI,
} = vi.hoisted(() => ({
  uploadReferenceAudioAPI: vi.fn(),
  generateAudioAPI: vi.fn(),
  checkAudioStatusAPI: vi.fn(),
  getVoiceAPI: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  uploadReferenceAudioAPI,
  generateAudioAPI,
  checkAudioStatusAPI,
  getVoiceAPI,
}))

const { uploadCover } = vi.hoisted(() => ({ uploadCover: vi.fn() }))

vi.mock('@/hooks/node/use-node-reference-upload', () => ({
  useNodeReferenceUpload: () => ({
    uploadFile: uploadCover,
    isUploading: false,
  }),
}))

vi.mock('@/components/ui/param-slider', () => ({
  ParamSlider: ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: number
    onChange: (value: number) => void
  }) => (
    <input
      type="range"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  ),
}))

const { updateNodeData } = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData,
    modelOptionsByType: { voice: [] },
  }),
}))

// ⚠ 必须挡掉：模型选择器一路拉进 studio-shared → studio-context →
// use-background-cards → api-client。本文件是**部分** mock api-client，
// 于是 `listBackgroundCardsAPI` 取不到，整个 suite 在 import 阶段就炸
// （不是断言失败，是 0 test）。
vi.mock('./DetailModelPicker', () => ({
  DetailModelPicker: () => null,
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => [],
  useEdges: () => [],
}))

vi.mock('../FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: ({
    open,
    onSelectVoiceId,
  }: {
    open: boolean
    onSelectVoiceId: (voice: {
      voiceId: string
      name: string
      coverImage: string | null
      sampleUrl: string | null
    }) => void
  }) =>
    open ? (
      <>
        <button
          type="button"
          data-testid="pick-voice"
          onClick={() =>
            onSelectVoiceId({
              voiceId: 'voice-123',
              name: 'Narrator One',
              coverImage: 'https://cdn.example.com/cover.png',
              sampleUrl: 'https://cdn.example.com/narrator-one.mp3',
            })
          }
        >
          pick
        </button>
        {/* 收藏来的系统音色就是这个形状：有 voiceId，没有任何示例音频。 */}
        <button
          type="button"
          data-testid="pick-voice-without-sample"
          onClick={() =>
            onSelectVoiceId({
              voiceId: 'voice-456',
              name: 'Sampleless One',
              coverImage: null,
              sampleUrl: null,
            })
          }
        >
          pick without sample
        </button>
      </>
    ) : null,
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    onSelect,
    title,
  }: {
    open: boolean
    title: string
    onSelect?: (generation: {
      url: string
      previewUrl: string | null
      thumbnailUrl: string | null
    }) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="pick-asset"
        onClick={() =>
          onSelect?.({
            url:
              title === 'coverDialogTitle'
                ? 'https://cdn.example.com/selected-cover.png'
                : 'https://cdn.example.com/asset.mp3',
            previewUrl: 'https://cdn.example.com/asset-cover.png',
            thumbnailUrl: null,
          })
        }
      >
        pickAsset
      </button>
    ) : null,
}))

import { NodeDetailFrame } from './NodeDetailFrame'
import { VoiceDetailBody } from './VoiceDetailBody'

function makeData(overrides: Partial<NodeWorkflowNodeData> = {}) {
  return {
    prompt: '',
    status: NODE_STATUS_IDS.idle,
    ...overrides,
  } as NodeWorkflowNodeData
}

/** S5 起音色族是**槽表提供者** —— 它自己不产出 DOM，必须套壳才能断言。 */
function voiceTree(data: NodeWorkflowNodeData) {
  return (
    <VoiceDetailBody nodeId="voice-1" type={NODE_TYPE_IDS.voice} data={data}>
      {(slots) => (
        <NodeDetailFrame identity={<span>identity</span>} slots={slots} />
      )}
    </VoiceDetailBody>
  )
}

function renderBody(data: NodeWorkflowNodeData) {
  return render(voiceTree(data))
}

describe('VoiceDetailBody', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认：库里没有现成样本 → 才轮到真正的合成。有样本的那条路单独有测。
    getVoiceAPI.mockResolvedValue({ success: true, data: { samples: [] } })
    generateAudioAPI.mockResolvedValue({
      success: true,
      data: { jobId: 'job-1' },
    })
    checkAudioStatusAPI.mockResolvedValue({
      success: true,
      data: {
        status: 'COMPLETED',
        generation: { url: 'https://cdn.example.com/sample.mp3' },
      },
    })
    uploadCover.mockResolvedValue({
      success: true,
      url: 'https://cdn.example.com/uploaded-cover.png',
    })
  })

  /**
   * ⚠ 这条替换了原来那条「两轨 object studio 版式」断言。
   * 迁移前音色族的 DOM 序是 **3→2→4→2→7→4**：左轨里塞着来源两档（槽 3）、
   * 音色卡（槽 2）、模型（槽 4）、代表音频（槽 2），右轨里是参数（槽 4）。
   * 那是十族里最严重的一处跳序，而契约「槽序 = DOM 序 = 键盘序」不可推翻。
   * 所以这条测的不再是「有没有两栏」，而是「七槽有没有按顺序排」。
   */
  it('七槽严格按 2→3→4→5→6→7 排布（迁移前是 3→2→4→2→7→4）', () => {
    const { container } = renderBody(makeData())

    expect(
      Array.from(container.querySelectorAll('[data-node-detail-slot]')).map(
        (element) => element.getAttribute('data-node-detail-slot'),
      ),
    ).toEqual([
      'identity-bar',
      'subject-stage',
      'compose-desk',
      'source-rack',
      'relations-strip',
      'evidence-drawer',
      'action-dock',
    ])
  })

  it('does not render a 台词 input — lines belong to the script', () => {
    renderBody(makeData())
    expect(screen.queryByLabelText('dialogue.label')).not.toBeInTheDocument()
  })

  // ⚠ 这里的 status 曾经是 ready —— 旧判据 `hasVoiceContent` 把「选了个情绪」
  // 也算成 ready，而一个只有情绪、没有任何音频的节点根本发不出参考音频。
  // 现在 ready 只表示「真的发得出去」，所以空节点加个情绪仍然是 idle。
  it('stores a selected emotion code and clears it on 无', () => {
    renderBody(makeData())
    fireEvent.click(screen.getByRole('button', { name: 'emotions.calm' }))
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceEmotion: 'calm',
      status: NODE_STATUS_IDS.idle,
    })

    fireEvent.click(screen.getByRole('button', { name: 'emotions.none' }))
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceEmotion: '',
      status: NODE_STATUS_IDS.idle,
    })
  })

  it('keeps a voice WITH audio ready when only the emotion changes', () => {
    renderBody(makeData({ voiceClipUrl: 'https://cdn.example.com/s.mp3' }))
    fireEvent.click(screen.getByRole('button', { name: 'emotions.calm' }))
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceEmotion: 'calm',
      status: NODE_STATUS_IDS.ready,
    })
  })

  /**
   * 真机 2026-08-10：收藏来的系统音色只有 voiceId，一个音频 url 都没有，却被
   * 盖成 ready —— 卡面绿灯，接进视频却静默发不出去，真相只在视频节点的槽架里。
   */
  it('does NOT mark a voice ready when the library returns no sample', () => {
    renderBody(makeData())
    fireEvent.click(screen.getByRole('button', { name: 'chooseVoice' }))
    fireEvent.click(screen.getByTestId('pick-voice-without-sample'))
    expect(updateNodeData).toHaveBeenCalledWith(
      'voice-1',
      expect.objectContaining({
        voiceId: 'voice-456',
        voiceClipUrl: undefined,
        status: NODE_STATUS_IDS.idle,
      }),
    )
  })

  /**
   * owner 2026-08-10：「声音库的音频可以直接拿来用无需再生成一次」。
   * 系统音色在库里本来就有示例音频，合成一次要花用户的 key、要等，产出的还是同
   * 一个音色念同一段固定文本 —— 所以有现成的就直接用，不碰 generateAudioAPI。
   */
  it('adopts the library sample instead of synthesizing one', async () => {
    getVoiceAPI.mockResolvedValue({
      success: true,
      data: {
        samples: [{ audio: 'https://cdn.example.com/library-sample.mp3' }],
      },
    })
    renderBody(makeData({ voiceId: 'voice-123', voiceName: '小爱弥斯' }))

    fireEvent.click(screen.getByRole('button', { name: 'generateSample' }))

    await waitFor(() => {
      expect(updateNodeData).toHaveBeenCalledWith(
        'voice-1',
        expect.objectContaining({
          voiceClipUrl: 'https://cdn.example.com/library-sample.mp3',
          status: NODE_STATUS_IDS.ready,
        }),
      )
    })
    expect(getVoiceAPI).toHaveBeenCalledWith('voice-123')
    expect(generateAudioAPI).not.toHaveBeenCalled()
  })

  it('falls back to synthesis only when the library has no sample', async () => {
    renderBody(makeData({ voiceId: 'voice-123', voiceName: '小爱弥斯' }))

    fireEvent.click(screen.getByRole('button', { name: 'generateSample' }))

    await waitFor(() => expect(generateAudioAPI).toHaveBeenCalled())
  })

  it('selects a system voice through the library dialog', () => {
    renderBody(makeData())
    fireEvent.click(screen.getByRole('button', { name: 'chooseVoice' }))
    fireEvent.click(screen.getByTestId('pick-voice'))
    expect(updateNodeData).toHaveBeenCalledWith('voice-1', {
      voiceId: 'voice-123',
      voiceName: 'Narrator One',
      voiceCoverImage: 'https://cdn.example.com/cover.png',
      voiceProvider: expect.any(String),
      voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
      voiceClipUrl: 'https://cdn.example.com/narrator-one.mp3',
      voiceClipSource: NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.library,
      status: NODE_STATUS_IDS.ready,
    })
  })

  /**
   * ⚠ S5 把 `activeSource` 合进了持久字段 `voiceSource`。迁移前这两档是组件本地
   * state，切换**不落库** —— 关掉面板再打开就弹回「系统音色」，而卡面
   * （`VoiceNode`）读的是 `voiceSource`，于是同一时刻卡和面板显示的来源不一致。
   * 所以这条从「点一下界面变了」改成「点一下**写库了**」，再单独验按字段渲染。
   */
  it('切换来源写进 voiceSource（不再是本地 state）', () => {
    renderBody(makeData())
    expect(screen.queryByText('uploadAudio')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'sourceMine' }))
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      status: NODE_STATUS_IDS.idle,
    })
  })

  it('按 voiceSource 渲染「我的音色」那一档', () => {
    renderBody(
      makeData({
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      }),
    )
    expect(screen.getByText('uploadAudio')).toBeInTheDocument()
  })

  it('generates a sample for the picked voice and carries its cover into 素材', async () => {
    renderBody(
      makeData({
        voiceId: 'voice-123',
        voiceName: 'Narrator One',
        voiceCoverImage: 'https://cdn.example.com/cover.png',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'generateSample' }))

    await waitFor(() => {
      // The voice's avatar rides along BY REFERENCE so the gallery clip shows it.
      expect(generateAudioAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceId: 'voice-123',
          coverImageUrl: 'https://cdn.example.com/cover.png',
        }),
      )
      expect(updateNodeData).toHaveBeenCalledWith(
        'voice-1',
        expect.objectContaining({
          voiceClipUrl: 'https://cdn.example.com/sample.mp3',
        }),
      )
    })
  })

  it('drops a stale sample if the voice changed during generation', async () => {
    let resolveStatus: (value: unknown) => void = () => {}
    checkAudioStatusAPI.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve
      }),
    )
    const { rerender } = renderBody(
      makeData({ voiceId: 'voice-123', voiceName: 'A' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'generateSample' }))
    await waitFor(() => expect(generateAudioAPI).toHaveBeenCalled())

    // Switch to a different voice while the audition poll is still pending.
    rerender(voiceTree(makeData({ voiceId: 'voice-999', voiceName: 'B' })))

    // The in-flight poll now resolves with the FIRST voice's clip.
    resolveStatus({
      success: true,
      data: {
        status: 'COMPLETED',
        generation: { url: 'https://cdn.example.com/stale-A.mp3' },
      },
    })

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'generateSample' }),
      ).not.toBeDisabled(),
    )
    expect(updateNodeData).not.toHaveBeenCalledWith(
      'voice-1',
      expect.objectContaining({
        voiceClipUrl: 'https://cdn.example.com/stale-A.mp3',
      }),
    )
  })

  it('pulls a generated clip from the library as reference audio + inherits its cover (素材)', () => {
    // ⚠ 来源现在由持久字段 `voiceSource` 决定，不再是本地 state ——
    // 点一下 sourceMine 只会调 `updateNodeData`，受控组件不会自己换视图。
    // 要验「我的音色」那一档就直接用该档的 data 渲染。
    renderBody(
      makeData({
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      }),
    )

    fireEvent.click(screen.getByText('referenceFromAssets'))
    fireEvent.click(screen.getByTestId('pick-asset'))

    // The inherited asset cover starts as the editable my-voice cover and
    // remains separate from the system voice cover.
    expect(updateNodeData).toHaveBeenCalledWith(
      'voice-1',
      expect.objectContaining({
        voiceClipUrl: 'https://cdn.example.com/asset.mp3',
        voiceReferenceCoverImage: 'https://cdn.example.com/asset-cover.png',
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      }),
    )
  })

  it('lets a system voice choose a cover from image assets', () => {
    renderBody(makeData({ voiceId: 'voice-123', voiceName: 'Narrator One' }))
    fireEvent.click(screen.getByRole('button', { name: 'coverFromAssets' }))
    fireEvent.click(screen.getByTestId('pick-asset'))
    expect(updateNodeData).toHaveBeenCalledWith(
      'voice-1',
      expect.objectContaining({
        voiceCoverImage: 'https://cdn.example.com/selected-cover.png',
      }),
    )
  })

  it('lets my voice upload its own cover without replacing the system cover', async () => {
    renderBody(
      makeData({
        voiceId: 'voice-123',
        voiceCoverImage: 'https://cdn.example.com/system-cover.png',
        voiceClipUrl: 'https://cdn.example.com/mine.mp3',
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      }),
    )

    const file = new File(['cover'], 'cover.png', { type: 'image/png' })
    const coverInput = document.querySelector<HTMLInputElement>(
      'input[accept="image/*"]',
    )
    expect(coverInput).not.toBeNull()
    fireEvent.change(coverInput!, {
      target: { files: [file] },
    })

    await waitFor(() =>
      expect(updateNodeData).toHaveBeenCalledWith(
        'voice-1',
        expect.objectContaining({
          voiceReferenceCoverImage:
            'https://cdn.example.com/uploaded-cover.png',
        }),
      ),
    )
    expect(updateNodeData).not.toHaveBeenCalledWith(
      'voice-1',
      expect.objectContaining({
        voiceCoverImage: 'https://cdn.example.com/uploaded-cover.png',
      }),
    )
  })

  it('writes voiceSpeed from the speed slider', () => {
    renderBody(makeData())
    fireEvent.change(screen.getByLabelText('speedLabel'), {
      target: { value: '1.5' },
    })
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceSpeed: 1.5,
      status: NODE_STATUS_IDS.idle,
    })
  })

  it('writes voiceVolume from the volume slider', () => {
    renderBody(makeData())
    fireEvent.change(screen.getByLabelText('volumeLabel'), {
      target: { value: '6' },
    })
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceVolume: 6,
      status: NODE_STATUS_IDS.idle,
    })
  })
})
