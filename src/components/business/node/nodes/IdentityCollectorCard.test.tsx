import { render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  edges: [] as Array<{ id: string; source: string; target: string }>,
  nodes: [] as Array<{ id: string; type: string }>,
  reducedMotion: false,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  useEdges: () => mocks.edges,
  useNodes: () => mocks.nodes,
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({ updateNodeData: mocks.updateNodeData }),
}))

vi.mock('./NodeShell', () => {
  const Header = () => null
  // status 转发到 data-status——真实 NodeShellRoot 就是这么把它递给
  // canvas.css 的 `.canvas-card[data-status=…]` 卡边规则的（见 NodeShell.tsx），
  // 画布修法 08-B 的审核态卡边回归测试需要读到这个属性。
  const NodeShell = ({
    children,
    status,
  }: {
    children?: ReactNode
    status?: string
  }) => <article data-status={status}>{children}</article>
  NodeShell.Header = Header
  return { NodeShell }
})

// motion/react 在 jsdom 里跑真动画意义不大（也拿不到中间帧），这里只截下传给
// motion.span 的 props —— 要守的是「计数第一次挂载不弹、真的变大了才弹、
// reduced-motion 下时长归零」，那都在 props 里（同 CanvasPopIn.test.tsx 的
// 手法）。
const motionCaptures: Array<{
  initial: unknown
  transition: { duration: number; ease: number[] }
}> = []

vi.mock('motion/react', () => ({
  useReducedMotion: () => mocks.reducedMotion,
  motion: {
    span: ({
      initial,
      animate,
      transition,
      children,
      ...rest
    }: Record<string, unknown> & { children?: ReactNode }) => {
      // 只是从 ...rest 里摘掉，不让它漏到真实 DOM span 上（同 NodeDetailPanel.
      // test.tsx 的 `void` 手法）——本测试不断言 animate 本身的值。
      void animate
      motionCaptures.push({
        initial,
        transition: transition as { duration: number; ease: number[] },
      })
      return <span {...rest}>{children}</span>
    },
  },
}))

import { IdentityCollectorCard } from './IdentityCollectorCard'

type Props = ComponentProps<typeof IdentityCollectorCard>

// `data` 故意收窄成宽松的 Record（同 CastCard.test.tsx 的 `makeNode` 手法）——
// 测试里的 referenceAssets 只填组件真正读的 id/url，不想为每条 fixture
// 补全 role/weight 等 NodeWorkflowReferenceAsset 的其余必填字段。
function makeProps(
  legacyType: Props['legacyType'],
  data: Record<string, unknown> = {},
): Props {
  return {
    id: 'identity-1',
    legacyType,
    data: { status: NODE_STATUS_IDS.idle, ...data },
    selected: false,
  } as Props
}

describe('IdentityCollectorCard', () => {
  beforeEach(() => {
    mocks.edges = []
    mocks.nodes = []
    mocks.reducedMotion = false
    motionCaptures.length = 0
  })

  it('renders an empty identity card without throwing', () => {
    expect(() =>
      render(
        <IdentityCollectorCard {...makeProps(NODE_TYPE_IDS.characterImage)} />,
      ),
    ).not.toThrow()
  })

  // B · 空态分家：角色空态人形、场景空态山形——不再共用一个 UserRound。
  it('shows the UserRound placeholder for an empty character card, Mountain for an empty background card', () => {
    const { unmount } = render(
      <IdentityCollectorCard {...makeProps(NODE_TYPE_IDS.characterImage)} />,
    )
    expect(document.querySelector('svg.lucide-user-round')).toBeTruthy()
    expect(document.querySelector('svg.lucide-mountain')).toBeFalsy()
    unmount()

    render(
      <IdentityCollectorCard {...makeProps(NODE_TYPE_IDS.backgroundImage)} />,
    )
    expect(document.querySelector('svg.lucide-mountain')).toBeTruthy()
    expect(document.querySelector('svg.lucide-user-round')).toBeFalsy()
  })

  it('shows the empty hint text and no inventory chips when there is no representative image', () => {
    render(
      <IdentityCollectorCard {...makeProps(NODE_TYPE_IDS.characterImage)} />,
    )
    expect(screen.getByText('identityEmptyHint')).toBeInTheDocument()
    expect(screen.queryByText('voiceSection')).not.toBeInTheDocument()
    expect(screen.queryByText('noVoice')).not.toBeInTheDocument()
  })

  // ⛔ 不可变契约 2（packet-3-identity.md）：▦N 读 referenceAssets，逻辑不动——
  // 这里只验证换皮后这条取数仍然正确。
  it('computes ▦N from referenceAssets and shows a representative thumbnail', () => {
    render(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.characterImage, {
          referenceAssets: [
            { id: 'a1', url: 'https://example.com/a1.png', source: 'canvas' },
            { id: 'a2', url: 'https://example.com/a2.png', source: 'canvas' },
          ],
        })}
      />,
    )
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'https://example.com/a1.png',
    )
  })

  // 画布修法 08-B 核验发现的缺口：`LooseImageCard` 包 4 已经把审核态接进
  // 卡边色（data-status='awaiting-review'/'rejected'，canvas.css 既有规则），
  // 身份卡（角色/场景）当时漏接——封面图待审/被打回时卡面完全没有标记。
  it('封面图待审 / 被打回时，卡边 data-status 显示审核态而不是普通 status', () => {
    const { unmount } = render(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.characterImage, {
          mediaUrl: 'https://example.com/cover.png',
          mediaReview: {
            'https://example.com/cover.png': { state: 'awaiting_review' },
          },
        })}
      />,
    )
    expect(document.querySelector('article')).toHaveAttribute(
      'data-status',
      'awaiting-review',
    )
    unmount()

    render(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.backgroundImage, {
          mediaUrl: 'https://example.com/cover.png',
          mediaReview: {
            'https://example.com/cover.png': { state: 'rejected' },
          },
        })}
      />,
    )
    expect(document.querySelector('article')).toHaveAttribute(
      'data-status',
      'rejected',
    )
  })

  it('封面图已通过审核（或从没被标过）时，卡边 data-status 仍是普通节点 status', () => {
    render(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.characterImage, {
          mediaUrl: 'https://example.com/cover.png',
        })}
      />,
    )
    // 祖父条款：没有 mediaReview 记录＝approved，不是待审——卡边照旧显示
    // 普通 idle 态，不该被误判成「待审」。
    expect(document.querySelector('article')).toHaveAttribute(
      'data-status',
      NODE_STATUS_IDS.idle,
    )
  })

  // ⛔ 不可变契约 2：🎙 由上游音色边推出，逻辑不动。
  it('shows the voice chip only when an upstream voice node feeds a character card', () => {
    mocks.edges = [{ id: 'e1', source: 'voice-1', target: 'identity-1' }]
    mocks.nodes = [{ id: 'voice-1', type: NODE_TYPE_IDS.voice }]

    const { unmount } = render(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.characterImage, {
          referenceAssets: [
            { id: 'a1', url: 'https://example.com/a1.png', source: 'canvas' },
          ],
        })}
      />,
    )
    expect(screen.getByText('voiceSection')).toBeInTheDocument()
    expect(screen.queryByText('noVoice')).not.toBeInTheDocument()
    unmount()

    // 契约明写：background 卡恒不读 hasVoice，即便挂着同一条边也不显示。
    render(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.backgroundImage, {
          referenceAssets: [
            { id: 'a1', url: 'https://example.com/a1.png', source: 'canvas' },
          ],
        })}
      />,
    )
    expect(screen.queryByText('voiceSection')).not.toBeInTheDocument()
    expect(screen.getByText('noVoice')).toBeInTheDocument()
  })

  // C · 计数回执：▦N 只在数值真的增加时弹一次，首次挂载不弹。
  it('does not pop the ▦N chip on first mount, but does once the count increases', () => {
    const baseData = {
      referenceAssets: [
        { id: 'a1', url: 'https://example.com/a1.png', source: 'canvas' },
      ],
    }
    const { rerender } = render(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.characterImage, baseData)}
      />,
    )
    expect(motionCaptures.at(-1)?.initial).toBe(false)

    rerender(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.characterImage, {
          referenceAssets: [
            ...baseData.referenceAssets,
            { id: 'a2', url: 'https://example.com/a2.png', source: 'canvas' },
          ],
        })}
      />,
    )
    expect(motionCaptures.at(-1)?.initial).toEqual({ scale: 1.2 })
  })

  it('keeps the pulse duration at 0 under prefers-reduced-motion while the count still updates', () => {
    mocks.reducedMotion = true
    const { rerender } = render(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.characterImage, {
          referenceAssets: [
            { id: 'a1', url: 'https://example.com/a1.png', source: 'canvas' },
          ],
        })}
      />,
    )

    rerender(
      <IdentityCollectorCard
        {...makeProps(NODE_TYPE_IDS.characterImage, {
          referenceAssets: [
            { id: 'a1', url: 'https://example.com/a1.png', source: 'canvas' },
            { id: 'a2', url: 'https://example.com/a2.png', source: 'canvas' },
          ],
        })}
      />,
    )
    expect(motionCaptures.at(-1)?.transition.duration).toBe(0)
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
