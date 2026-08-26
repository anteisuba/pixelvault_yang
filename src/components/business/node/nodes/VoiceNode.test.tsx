import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NODE_STUDIO_AUDIO_INPUT,
  NODE_STUDIO_VOICE_CLIP_SOURCE_IDS,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import { NODE_STATUS_IDS } from '@/constants/node-types'

const { updateNodeData } = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => [],
  useEdges: () => [],
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({ updateNodeData }),
}))

vi.mock('../FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="voice-library-dialog" /> : null,
}))

// 《画布修法》刀二·B2（2026-08-26）：卡上的空态主动作从「直接打开声音库」
// 换成了一个带两项的小菜单（声音库 / 从素材选择），新增这两个 mock 只服务
// 这一改动——同一份最小-mock 精神，不整体替身与本文件无关的重依赖。
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    onSelect,
  }: {
    open: boolean
    onSelect: (generation: {
      url: string
      previewUrl?: string
      thumbnailUrl?: string
    }) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="pick-asset"
        onClick={() =>
          onSelect({
            url: 'https://cdn.test/clip.mp3',
            thumbnailUrl: 'https://cdn.test/clip.png',
          })
        }
      >
        pick
      </button>
    ) : null,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

// 卡外 status 通过 data 属性读出来——比把 props 存进外层变量更贴这个仓库
// 既有的 node 测试写法（见 VideoReferenceNode.test.tsx）。
vi.mock('./NodeShell', () => {
  const Header = () => null
  Header.displayName = 'NodeShellHeader'
  const NodeShell = ({
    children,
    status,
  }: {
    children?: ReactNode
    status?: string
  }) => (
    <div data-testid="node-shell" data-status={status}>
      {children}
    </div>
  )
  NodeShell.displayName = 'NodeShell'
  NodeShell.Header = Header
  return { NodeShell }
})

import { VoiceNode } from './VoiceNode'

function renderVoice(data: Record<string, unknown>) {
  const props = {
    id: 'voice-1',
    type: 'voice',
    data: { prompt: '', status: NODE_STATUS_IDS.idle, ...data },
    selected: false,
  } as unknown as ComponentProps<typeof VoiceNode>
  return render(<VoiceNode {...props} />)
}

beforeEach(() => {
  updateNodeData.mockClear()
})

/**
 * 真机 2026-08-10：收藏来的系统音色只有 voiceId、一个音频 url 都没有，卡面却是
 * 绿的 ready —— 接进视频节点静默发不出去，真相只在下游槽架里。
 *
 * ⚠ 这一族最容易的错法是「只改两个写入点的 status」——本组件**自己重算** status
 * （旧写法 `hasVoiceIdentity ? ready : data.status`，有 voiceId 就够），所以那种改
 * 法在渲染上完全看不见。这里锁的就是重算这一步。
 */
describe('VoiceNode', () => {
  it('does not claim ready when the voice has no audio at all', () => {
    const { container, getByTestId } = renderVoice({
      voiceId: 'voice-123',
      voiceName: '元気な女性',
      voiceSource: 'fishAudio',
    })

    expect(getByTestId('node-shell')).toHaveAttribute(
      'data-status',
      NODE_STATUS_IDS.idle,
    )
    expect(container.textContent).toContain('noSample')
    expect(container.textContent).not.toContain('kindSpeech')
  })

  /**
   * 存量节点里躺着旧代码写死的 `ready`。真机 2026-08-10 复验时抓到：摘要行已经
   * 说「暂无试听样本」，卡的 data-status 却还是 ready —— 因为兜底把陈旧的持久化
   * 值原样透传了。发不出去就不许显示 ready。
   */
  it('downgrades a stale persisted ready when the audio is gone', () => {
    const { getByTestId } = renderVoice({
      voiceId: 'voice-123',
      voiceName: '小爱弥斯',
      voiceSource: 'fishAudio',
      status: NODE_STATUS_IDS.ready,
    })

    expect(getByTestId('node-shell')).toHaveAttribute(
      'data-status',
      NODE_STATUS_IDS.idle,
    )
  })

  it('is ready once the voice carries a sample url', () => {
    const { container, getByTestId } = renderVoice({
      voiceId: 'voice-123',
      voiceName: '元気な女性',
      voiceSource: 'fishAudio',
      voiceClipUrl: 'https://cdn.example.com/sample.mp3',
    })

    expect(getByTestId('node-shell')).toHaveAttribute(
      'data-status',
      NODE_STATUS_IDS.ready,
    )
    expect(container.textContent).toContain('kindSpeech')
  })

  // 自己上传的参考音频走另一档，同样算「发得出去」。
  it('is ready from an uploaded reference audio', () => {
    const { getByTestId } = renderVoice({
      voiceName: '我的音色',
      voiceSource: 'referenceAudio',
      voiceClipUrl: 'https://cdn.example.com/ref.mp3',
    })

    expect(getByTestId('node-shell')).toHaveAttribute(
      'data-status',
      NODE_STATUS_IDS.ready,
    )
  })
})

// ── 《画布修法》刀二·B2（2026-08-26）── 一族一扇门：卡上唯一入口到达两种来源 ──
// 工具条撤掉 VoiceCapability 的 声音库/从素材选择 两颗按钮后（见
// CanvasImageSelectionToolbar.test.tsx），卡上「从音频库选择音色」这一颗改用
// 小菜单同时到达声音库（FishVoiceLibraryDialog）与素材库
// （AssetSelectorDialog）。这组用例锁住两条路径各自落地的字段，防止日后有人
// 把某一条路悄悄漏掉。
describe('VoiceNode — B2 一族一扇门：卡上唯一入口到达两种来源', () => {
  it('空态卡的主动作旁边同时挂着 声音库 与 从素材选择 两个来源', () => {
    renderVoice({})
    expect(screen.getByText('emptyCardAction')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'chooseVoice' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'referenceFromAssets' }),
    ).toBeInTheDocument()
  })

  it('声音库 打开 FishVoiceLibraryDialog（与撤掉前的工具条按钮同一条通道）', () => {
    renderVoice({})
    expect(screen.queryByTestId('voice-library-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chooseVoice' }))
    expect(screen.getByTestId('voice-library-dialog')).toBeInTheDocument()
  })

  it('从素材选择 打开 AssetSelectorDialog，选中后写回与撤掉前的 VoiceCapability 完全一致的字段集', () => {
    renderVoice({})
    fireEvent.click(screen.getByRole('button', { name: 'referenceFromAssets' }))
    fireEvent.click(screen.getByTestId('pick-asset'))

    expect(updateNodeData).toHaveBeenCalledWith('voice-1', {
      voiceClipUrl: 'https://cdn.test/clip.mp3',
      voiceClipSource: NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.uploaded,
      voiceReferenceAudioName: 'referenceAudioFallback',
      voiceReferenceAudioMimeType: NODE_STUDIO_AUDIO_INPUT.assetMimeType,
      voiceReferenceCoverImage: 'https://cdn.test/clip.png',
      voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      status: NODE_STATUS_IDS.ready,
    })
  })

  it('非空态（比如已经有 voiceId）不渲染这个入口菜单', () => {
    renderVoice({ voiceId: 'v1', voiceName: '旁白' })
    expect(
      screen.queryByRole('button', { name: 'chooseVoice' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'referenceFromAssets' }),
    ).not.toBeInTheDocument()
  })
})
