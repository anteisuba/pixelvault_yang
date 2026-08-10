import { render } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

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
  FishVoiceLibraryDialog: () => null,
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
