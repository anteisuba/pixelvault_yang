import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => [],
  useEdges: () => [],
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

vi.mock('@/hooks/node/use-node-reference-upload', () => ({
  useNodeReferenceUpload: () => ({ uploadFile: vi.fn(), isUploading: false }),
}))

vi.mock('@/hooks/cards/use-character-cards', () => ({
  useCharacterCards: () => ({ cards: [], findCard: () => null }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock('@/components/business/node/CharacterImageReferenceControls', () => ({
  CharacterImageReferenceControls: () => (
    <button type="button">reference-controls</button>
  ),
}))

vi.mock('@/components/business/node/WorkflowModelPicker', () => ({
  WorkflowModelPicker: () => <div>model-picker</div>,
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData: vi.fn(),
    deleteEdge: vi.fn(),
    generateMediaNode: vi.fn(),
    extractReference: vi.fn(),
    spawnReference: vi.fn(),
    modelOptionsByType: {},
  }),
}))

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { CharacterDetailBody } from './CharacterDetailBody'
import { FrameDetailBody } from './FrameDetailBody'
import { LooseImageDetailBody } from './LooseImageDetailBody'
import { NodeDetailFrame } from './NodeDetailFrame'
import { ShotDetailBody } from './ShotDetailBody'
import type { NodeDetailSlots } from './slots'

function slotOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-node-detail-slot]')).map(
    (element) => element.getAttribute('data-node-detail-slot') ?? '',
  )
}

function renderFamily(
  Family: (props: {
    nodeId: string
    type: (typeof NODE_TYPE_IDS)[keyof typeof NODE_TYPE_IDS]
    data: NodeWorkflowNodeData
    children: (slots: NodeDetailSlots) => ReactNode
  }) => ReactNode,
  type: (typeof NODE_TYPE_IDS)[keyof typeof NODE_TYPE_IDS],
  data: NodeWorkflowNodeData,
) {
  return render(
    <Family nodeId="node-1" type={type} data={data}>
      {(slots) => (
        <NodeDetailFrame identity={<span>identity</span>} slots={slots} />
      )}
    </Family>,
  )
}

describe('图片族 × 七槽（S4）', () => {
  /**
   * ⚠ 这条断言守的是契约里唯一「不可推翻」的一条：**槽序 = DOM 序 = 键盘序**。
   * 方向 C 就是因为桌面 Tab 序跳成 3→5→2→4→6→7 被判出局，而 Tab 序在没有
   * tabindex 的前提下就是 DOM 序 —— 所以查 DOM 序等于查键盘序。
   */
  it('媒体井族按 2→3→4→5→6→7 排布，一格不跳', () => {
    const { container } = renderFamily(
      FrameDetailBody,
      NODE_TYPE_IDS.frameImage,
      {
        prompt: '',
        status: NODE_STATUS_IDS.idle,
      },
    )

    expect(slotOrder(container)).toEqual([
      'identity-bar',
      'subject-stage',
      'compose-desk',
      'source-rack',
      'relations-strip',
      'evidence-drawer',
      'action-dock',
    ])
  })

  /**
   * 契约 §6 给角色族的是「素材架整栏不渲染 · 编排台空 · 动作坞空」。
   * ⚠ 判据是**整栏不在 DOM 里**，不是「渲染了一个空 div」——后者仍占 R12 的槽间距，
   * 面板上会出现三段说不清来历的空白。
   */
  it('角色族的素材架/编排台/动作坞整栏不渲染，关系带与证据抽屉仍在位', () => {
    const { container } = renderFamily(
      CharacterDetailBody,
      NODE_TYPE_IDS.characterImage,
      { prompt: '', characterName: '小林', status: NODE_STATUS_IDS.idle },
    )

    expect(slotOrder(container)).toEqual([
      'identity-bar',
      'subject-stage',
      'relations-strip',
      'evidence-drawer',
    ])
  })

  /**
   * R2「空态：占几何可以，占内容不行」。旧实现的空态是一块虚线框 + 「上传图片」
   * 标题 + 「点击 / 拖拽 / 粘贴 (Ctrl+V)」说明行 —— 三样都是 R2 点名要删的。
   * 上传这条路本身没删（井仍可点可拖可粘贴，素材架里还有一颗显式按钮）。
   */
  it('空井不出现说明文案，但仍是可操作的上传落点', () => {
    renderFamily(FrameDetailBody, NODE_TYPE_IDS.frameImage, {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    })

    expect(screen.queryByText('dropzoneHint')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'existing.upload' }),
    ).toBeInTheDocument()
  })

  it('keeps one reference entry and removes duplicate Studio and LoRA controls', () => {
    renderFamily(FrameDetailBody, NODE_TYPE_IDS.frameImage, {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    })

    expect(screen.getAllByText('fieldReferences')).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: 'reference-controls' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('openStudio')).not.toBeInTheDocument()
    expect(screen.queryByText('lora-controls')).not.toBeInTheDocument()
    expect(screen.queryByText('fieldLoras')).not.toBeInTheDocument()
  })

  it('keeps main-image replacement separate from adding a reference', () => {
    renderFamily(FrameDetailBody, NODE_TYPE_IDS.frameImage, {
      prompt: '',
      mediaUrl: 'https://example.com/frame.png',
      status: NODE_STATUS_IDS.done,
    })

    expect(
      screen.getByRole('button', { name: 'replaceImage' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'reference-controls' }),
    ).toBeInTheDocument()
  })

  /**
   * 契约 §7：生成中「无百分比、无取消、**无进度条**」。
   * ⚠ 查 `role=progressbar` 而不是查 class —— 换皮肤时 class 会变，
   * 而「有没有一个进度条」这件事在无障碍树上是确定的。
   */
  it('生成中不出现进度条', () => {
    renderFamily(FrameDetailBody, NODE_TYPE_IDS.frameImage, {
      prompt: '一只猫',
      status: NODE_STATUS_IDS.running,
      generationStatus: NODE_GENERATION_STATUS_IDS.pending,
    })

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

/**
 * 画布修法包 C（2026-08-26）：镜头图空态让位——`ShotDetailBody` 是
 * `promoteFieldsWhenEmpty` 唯一的调用方，其余三族（散图/关键帧/背景）走
 * `ImageFamilyBody` 默认档，上面那组「图片族 × 七槽」测试已经守住它们
 * 一像素不变。这里单独锁镜头图自己的两态。
 */
describe('镜头图 · 空态让位（画布修法包 C）', () => {
  it('空态：写作台字段搬进 stage，desk 只剩模型选择器，DOM 七槽不跳', () => {
    const { container } = renderFamily(ShotDetailBody, NODE_TYPE_IDS.shot, {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    })

    // 契约唯一不可推翻的一条：槽序 = DOM 序 = 键盘序，七槽一格不跳。
    expect(slotOrder(container)).toEqual([
      'identity-bar',
      'subject-stage',
      'compose-desk',
      'source-rack',
      'relations-strip',
      'evidence-drawer',
      'action-dock',
    ])

    const stage = container.querySelector(
      '[data-node-detail-slot="subject-stage"]',
    )
    const desk = container.querySelector(
      '[data-node-detail-slot="compose-desk"]',
    )
    // prompt 字段（镜头图走 MentionInput，aria-label 与其余长字段同一套）
    // 现在住在 stage 里，desk 不再重复它。
    expect(stage?.querySelector('[aria-label="prompt.label"]')).not.toBeNull()
    expect(desk?.querySelector('[aria-label="prompt.label"]')).toBeNull()
    expect(stage?.querySelector('[aria-label="camera.label"]')).not.toBeNull()
    // desk 这个状态下只剩模型选择器——夹具没有可用模型选项时它按 R3
    // 整栏不渲染（`DetailModelPicker` 既有行为），desk 因此是空的但仍在位
    // （上面的 DOM 序断言已经锁住 compose-desk 没有从 DOM 里消失）。
    expect(desk).not.toBeNull()
    expect(desk?.querySelector('[aria-label="camera.label"]')).toBeNull()
    // 井退成预览带——仍在 stage 槽上，不是被删掉（R2：空态占几何不占内容，
    // 极淡字形 + 一行提示，零解释文案之外的「生成后出现在这里」是本包对
    // R2 的就地更正）。
    expect(stage?.querySelector('.canvas-detail-stage-band')).not.toBeNull()
    expect(screen.getByText('stagePreviewHint')).toBeInTheDocument()
  })

  it('有图之后版式立刻回到今天的媒体优先——字段回到 desk，stage 只剩媒体井', () => {
    const { container } = renderFamily(ShotDetailBody, NODE_TYPE_IDS.shot, {
      prompt: '一只猫',
      mediaUrl: 'https://cdn.test/shot.png',
      status: NODE_STATUS_IDS.done,
    })

    const stage = container.querySelector(
      '[data-node-detail-slot="subject-stage"]',
    )
    const desk = container.querySelector(
      '[data-node-detail-slot="compose-desk"]',
    )
    expect(desk?.querySelector('[aria-label="prompt.label"]')).not.toBeNull()
    expect(stage?.querySelector('.canvas-detail-stage-promoted')).toBeNull()
    expect(stage?.querySelector('.canvas-detail-stage-band')).toBeNull()
  })
})

/**
 * 画布修法包 E（2026-08-26）：散图空态先问「上传还是生成」——owner 确认见
 * docs/plans/prototypes/canvas-detail-empty-ui.html「收入口 01 · 图片」。
 * `LooseImageDetailBody` 是 `offerChoiceWhenEmpty` 唯一的调用方，其余三族
 * （镜头图/关键帧/背景）都不传，上面两组测试已经守住它们一像素不受影响。
 */
describe('散图 · 空态先问一句（画布修法包 E）', () => {
  function renderLooseImage(data: NodeWorkflowNodeData, nodeId = 'node-1') {
    return render(
      <LooseImageDetailBody
        nodeId={nodeId}
        type={NODE_TYPE_IDS.image}
        data={data}
      >
        {(slots) => (
          <NodeDetailFrame identity={<span>identity</span>} slots={slots} />
        )}
      </LooseImageDetailBody>,
    )
  }

  it('空态先给两颗按钮，不是灰井 + 铺开的字段/模型；七槽 DOM 序不跳', () => {
    const { container } = renderLooseImage({
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    })

    expect(slotOrder(container)).toEqual([
      'identity-bar',
      'subject-stage',
      'compose-desk',
      'source-rack',
      'relations-strip',
      'evidence-drawer',
      'action-dock',
    ])

    expect(
      screen.getByRole('button', { name: 'existing.upload' }),
    ).toBeInTheDocument()
    expect(screen.getByText('emptyChoice.generateTitle')).toBeInTheDocument()
    expect(screen.getByText('emptyChoice.uploadHint')).toBeInTheDocument()
    expect(screen.getByText('emptyChoice.generateHint')).toBeInTheDocument()
    // 动作坞的阻塞原因换成「选一条开始」，不是 noModel/noPrompt——两条路都
    // 还没选，noModel 那句在这一屏没有意义。
    expect(screen.getByText('emptyChoice.dockHint')).toBeInTheDocument()
    // 两条路的控件不同时铺开：模型选择器、prompt 字段此刻都不该出现。
    expect(screen.queryByLabelText('prompt.label')).not.toBeInTheDocument()

    const desk = container.querySelector(
      '[data-node-detail-slot="compose-desk"]',
    )
    // 槽位仍在（DOM 序没跳，上面已断言），只是此刻空着——`null` 不是
    // `undefined`，这条顺带锁住两者不被混用（slots.ts 头注那条区分）。
    expect(desk).not.toBeNull()
    expect(desk?.textContent).toBe('')
  })

  it('点「用 AI 生成」后这一屏变成写作台（复用包 C 的 promoteFieldsWhenEmpty）', () => {
    const { container } = renderLooseImage({
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    })

    fireEvent.click(screen.getByText('emptyChoice.generateTitle'))

    const stage = container.querySelector(
      '[data-node-detail-slot="subject-stage"]',
    )
    expect(stage?.querySelector('.canvas-detail-fork')).toBeNull()
    expect(stage?.querySelector('[aria-label="prompt.label"]')).not.toBeNull()
    expect(stage?.querySelector('.canvas-detail-stage-band')).not.toBeNull()
    // 两颗选择按钮已经不在了——这一屏现在只回答「生成」这一件事。
    expect(
      screen.queryByRole('button', { name: 'existing.upload' }),
    ).not.toBeInTheDocument()
  })

  it('点「上传图片」直接触发既有文件输入，不新造一条上传通路、也不切进写作台', () => {
    renderLooseImage({ prompt: '', status: NODE_STATUS_IDS.idle })

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'existing.upload' }))

    expect(clickSpy).toHaveBeenCalledTimes(1)
    // 还停在「先问一句」——没有一个隐藏的 state 被顺手带去写作台。
    expect(
      screen.getByRole('button', { name: 'existing.upload' }),
    ).toBeInTheDocument()
    expect(screen.getByText('emptyChoice.generateTitle')).toBeInTheDocument()

    clickSpy.mockRestore()
  })

  it('有内容时与改前一致：主区是媒体井，不是两颗按钮（回归）', () => {
    const { container } = renderLooseImage({
      prompt: '一只猫',
      mediaUrl: 'https://cdn.test/loose.png',
      status: NODE_STATUS_IDS.done,
    })

    const stage = container.querySelector(
      '[data-node-detail-slot="subject-stage"]',
    )
    expect(stage?.querySelector('.canvas-detail-fork')).toBeNull()
    expect(stage?.querySelector('.canvas-detail-well')).not.toBeNull()
    expect(screen.getByText('imageAlt')).toBeInTheDocument()
  })

  /**
   * `LooseImageDetailBody` 挂在 `key={presentationType}` 下（见
   * `NodeDetailPanel.renderFrame`），同类型节点之间切换**不会**重新挂载这个
   * 组件实例——面板本地 state 若不按 nodeId 归零，节点 A 上选过的「生成」
   * 会直接带到节点 B 上，B 不会再被问一次。这条测试锁的就是这个真实存在的
   * 跨节点串态风险（`ImageFamilyBody` 的 `useEffect(() => ..., [nodeId])`）。
   */
  it('切到同类型的另一个空节点时重新问一句，不带着上一个节点选过的「生成」', () => {
    const emptyData = { prompt: '', status: NODE_STATUS_IDS.idle }
    const { rerender } = renderLooseImage(emptyData, 'img-a')

    fireEvent.click(screen.getByText('emptyChoice.generateTitle'))
    expect(
      screen.queryByRole('button', { name: 'existing.upload' }),
    ).not.toBeInTheDocument()

    rerender(
      <LooseImageDetailBody
        nodeId="img-b"
        type={NODE_TYPE_IDS.image}
        data={emptyData}
      >
        {(slots) => (
          <NodeDetailFrame identity={<span>identity</span>} slots={slots} />
        )}
      </LooseImageDetailBody>,
    )

    expect(
      screen.getByRole('button', { name: 'existing.upload' }),
    ).toBeInTheDocument()
  })
})
