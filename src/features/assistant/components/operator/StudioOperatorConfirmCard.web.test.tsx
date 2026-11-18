// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import type { ReactElement } from 'react'
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StudioOperatorConfirmCard } from './StudioOperatorConfirmCard'
import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import { AI_MODELS, getModelMessageKey } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { CanvasNodeGenerationState } from '@/lib/studio-operator-canvas-snapshot'
import type { StudioOperatorKnobOrigins } from '@/lib/studio-operator-confirm-origins'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import {
  apiKeyRecord,
  openQuickSetup,
  runIdleTasksImmediately,
  submitQuickSetup,
} from '@/test/api-keys'
import type {
  StudioOperatorConfirmPrompt,
  StudioOperatorGenerationControls,
  StudioOperatorGenerationDraft,
} from '@/types/studio-assistant-operator'

/**
 * **确认卡**的回归闸（v2 §3.3 / 画板 BCards「确认」那一节的五态）。
 *
 * 钉五件事：
 *  ① 多步：一行动作串 + 「开始 / 一步一步来」两颗，各自走各自的回调；
 *  ② 生成 · 默认态：四颗旋钮读数在场；
 *  ②' 11-18 起卡只做摘要：读数一律只读，这一轮助手动过的写「旧值 → 新值」，
 *     ⛔ 没有下拉 / 输入框（同一个值不再有第三处能改）；
 *  ③ 确认中：两颗按钮都不可点（同一帧里连点 = 两枪）；
 *  ④ 已确认 · 时间：整卡收成一行，⛔ 两颗按钮整个不画；
 *  ⑤ 已取消 · 时间：写「没有执行」，且只有这一格长「再来一次」。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return t
  },
}))

/**
 * 配 key 弹窗是真的 `QuickSetupDialog`（挂在真 `ApiKeysProvider` 里）；只假 api-client
 * 上 key 那几条：名单是空的，存 key 回 `k-new`，验证通过。
 */
const keysApi = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  verify: vi.fn(),
  remove: vi.fn(),
  userSeq: 0,
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  listApiKeys: keysApi.list,
  createApiKey: keysApi.create,
  verifyApiKey: keysApi.verify,
  deleteApiKey: keysApi.remove,
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    userId: `confirm-user-${keysApi.userSeq}`,
    isLoaded: true,
    isSignedIn: true,
  }),
}))

beforeEach(() => {
  window.localStorage.clear()
  runIdleTasksImmediately()
  keysApi.userSeq += 1
  keysApi.list.mockResolvedValue({ success: true, data: [] })
  keysApi.create.mockImplementation(async (input: { modelId: string }) => ({
    success: true,
    data: apiKeyRecord({ id: 'k-new', modelId: input.modelId }),
  }))
  keysApi.verify.mockResolvedValue({
    success: true,
    data: { status: 'available' },
  })
})

function render(ui: ReactElement) {
  const view = rtlRender(<ApiKeysProvider>{ui}</ApiKeysProvider>)
  return {
    ...view,
    rerender: (next: ReactElement) =>
      view.rerender(<ApiKeysProvider>{next}</ApiKeysProvider>),
  }
}

/* ⚠ 搭配卡等几支不走这张卡（见 `StudioOperatorConfirmCardProps` 头注）。 */
type ConfirmCardPrompt = Exclude<
  StudioOperatorConfirmPrompt,
  {
    kind: 'loraSetup' | 'characterProfile' | 'characterImages' | 'upscale'
  }
>

const MULTISTEP: ConfirmCardPrompt = {
  id: 'c1',
  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep,
  steps: [
    { id: 's1', label: '查来源' },
    { id: 's2', label: '改提示词' },
    { id: 's3', label: '换模型' },
  ],
  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
}

const GENERATE: ConfirmCardPrompt = {
  id: 'c2',
  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
  request: {
    model: { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
    count: 3,
    specs: {
      aspectRatio: '3:2',
      resolution: '1536',
      durationSeconds: null,
    },
    label: '胶片质感',
  },
}

/**
 * 画布那一枪（`canvas_generate`，node-canvas-v2 §13.2.1）—— 同一张卡、同一支。
 * ⚠ 画布快照只给模型 id，所以载荷里的 `label` 就是 id。
 */
const CANVAS_GENERATE: ConfirmCardPrompt = {
  id: 'c4',
  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
  request: {
    model: { id: AI_MODELS.FLUX_2_FLASH, label: AI_MODELS.FLUX_2_FLASH },
    count: 1,
    specs: { aspectRatio: null, resolution: null, durationSeconds: null },
    canvasNode: { id: 'shot-1', name: '主角正面' },
  },
}

/** 助手提议记一张卡（v2 §8.1）—— 第三支。 */
const CONTEXT_CARD: ConfirmCardPrompt = {
  id: 'c3',
  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard,
  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
  card: {
    kind: 'character',
    name: '西格莉卡',
    summary: '银发金瞳，控制室机甲服',
    body: '## 外貌\n银发、金瞳。',
    negative: '空气涟漪',
  },
}

/**
 * 工作台那份真值视图（§5.2）—— ⚠ 与 `GENERATE.request` **故意不同**：
 * 卡有 `controls` 时必须读它而不是读载荷，不同才验得出来。
 */
const CONTROLS: StudioOperatorGenerationControls = {
  model: { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
  models: [
    { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
    { id: 'seedream-4', label: 'Seedream 4' },
  ],
  aspectRatio: '3:2',
  resolution: '1536',
  count: 3,
  choicesByModel: {
    'flux-2-flash': {
      aspectRatios: ['3:2', '1:1'],
      resolutions: ['1536', '2048'],
      counts: [1, 2, 4],
    },
    'seedream-4': { aspectRatios: ['1:1'], resolutions: [], counts: [] },
  },
}

function renderCard(
  /* ⚠ 搭配卡等几支不走这张卡（见 `StudioOperatorConfirmCardProps` 头注）。 */
  confirm: ConfirmCardPrompt,
  extra: {
    controls?: StudioOperatorGenerationControls
    canGenerate?: boolean
    canvasState?: CanvasNodeGenerationState | null
    searchGrounding?: {
      available: boolean
      on: boolean
      setOn: (on: boolean) => void
    }
    origins?: StudioOperatorKnobOrigins
    draft?: StudioOperatorGenerationDraft
  } = {},
) {
  const handlers = {
    onApprove: vi.fn(),
    onDecline: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onSaveCard: vi.fn(),
    onDismissCard: vi.fn(),
    onRetry: vi.fn(),
  }
  const view = render(
    <StudioOperatorConfirmCard
      confirm={confirm}
      {...handlers}
      {...extra}
      formatTime={() => '11:24'}
    />,
  )
  return {
    ...handlers,
    rerenderCanvas: (canvasState: CanvasNodeGenerationState | null) =>
      view.rerender(
        <StudioOperatorConfirmCard
          confirm={confirm}
          {...handlers}
          {...extra}
          canvasState={canvasState}
          formatTime={() => '11:24'}
        />,
      ),
  }
}

it('画布确认卡跟随目标节点参数变化，展示画质与模型默认值', () => {
  const canvasState: CanvasNodeGenerationState = {
    id: 'shot-1',
    name: '主角正面',
    kind: 'image',
    model: AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST,
    parameters: {
      values: { aspectRatio: '3:4', quality: 'high', count: 2 },
      options: {
        aspectRatio: ['1:1', '3:4'],
        quality: ['auto', 'high'],
        resolution: ['2K', '4K'],
        count: [1, 2],
      },
    },
  }
  const view = renderCard(CANVAS_GENERATE, { canvasState })
  expect(screen.getByText('3:4')).toBeInTheDocument()
  expect(screen.getByText('high')).toBeInTheDocument()
  expect(screen.getByText('confirm.generate.modelDefault')).toBeInTheDocument()
  expect(screen.getByText('confirm.generate.count:2')).toBeInTheDocument()
  view.rerenderCanvas({
    ...canvasState,
    parameters: {
      ...canvasState.parameters!,
      values: { aspectRatio: '1:1', count: 1, resolution: '4K' },
    },
  })
  expect(screen.getByText('1:1')).toBeInTheDocument()
  expect(screen.getByText('4K')).toBeInTheDocument()
  expect(screen.queryByText('high')).not.toBeInTheDocument()
  expect(screen.getByText('confirm.generate.modelDefault')).toBeInTheDocument()
  expect(view.onConfirm).not.toHaveBeenCalled()
  view.rerenderCanvas(null)
  expect(screen.getByTestId('operator-confirm-primary')).toBeDisabled()
})

describe('StudioOperatorConfirmCard', () => {
  /**
   * **上下文卡提议**（v2 §8.1）—— 卡上摆草稿预览，两颗按钮各走各的回调。
   * ⛔ 它不该长出生成那几颗旋钮：这一支一分钱都不花。
   */
  it('上下文卡：档 + 名字 + 摘要 + 正文，两颗按钮各走各的', () => {
    const handlers = renderCard(CONTEXT_CARD)
    expect(screen.getByTestId('operator-confirm-card').dataset.kind).toBe(
      'contextCard',
    )
    expect(screen.getByTestId('operator-confirm-title')).toHaveTextContent(
      'confirm.contextCard.title',
    )
    const preview = screen.getByTestId('operator-confirm-context-card')
    expect(preview.dataset.cardKind).toBe('character')
    expect(preview).toHaveTextContent('西格莉卡')
    expect(preview).toHaveTextContent('银发金瞳，控制室机甲服')
    expect(preview).toHaveTextContent('银发、金瞳。')
    expect(screen.queryByTestId('operator-confirm-knobs')).toBeNull()

    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(handlers.onSaveCard).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-confirm-secondary'))
    expect(handlers.onDismissCard).toHaveBeenCalledTimes(1)
    // ⛔ 另外两支的回调一条都不该被碰到。
    expect(handlers.onConfirm).not.toHaveBeenCalled()
    expect(handlers.onApprove).not.toHaveBeenCalled()
  })

  /** 存下之后就地收成一行「已确认 · 11:24 · 卡名 · 已存下」，⛔ 不离开时间线。 */
  it('上下文卡 · 已确认：收成一行，带卡名，⛔ 两颗按钮不画', () => {
    renderCard({
      ...CONTEXT_CARD,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed,
      decidedAt: '2026-09-11T03:24:00.000Z',
    })
    expect(screen.getByTestId('operator-confirm-state')).toHaveTextContent(
      'confirm.state.confirmed:11:24',
    )
    expect(screen.getByTestId('operator-confirm-card')).toHaveTextContent(
      '西格莉卡',
    )
    expect(screen.getByTestId('operator-confirm-card')).toHaveTextContent(
      'confirm.contextCard.saved',
    )
    expect(screen.queryByTestId('operator-confirm-primary')).toBeNull()
    // ⛔ 「再来一次」只长在生成 · 已取消那一格上。
    expect(screen.queryByTestId('operator-confirm-retry')).toBeNull()
  })

  it('上下文卡 · 已取消：写「没有存」', () => {
    renderCard({
      ...CONTEXT_CARD,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled,
      decidedAt: '2026-09-11T03:22:00.000Z',
    })
    expect(screen.getByTestId('operator-confirm-card')).toHaveTextContent(
      'confirm.contextCard.notSaved',
    )
    expect(screen.queryByTestId('operator-confirm-retry')).toBeNull()
  })

  it('多步：一行动作串 + 开始 / 一步一步来', () => {
    const handlers = renderCard(MULTISTEP)
    expect(screen.getByTestId('operator-confirm-card').dataset.kind).toBe(
      'multistep',
    )
    expect(screen.getByTestId('operator-confirm-title')).toHaveTextContent(
      'confirm.multistep.title:3',
    )
    expect(screen.getByTestId('operator-confirm-steps')).toHaveTextContent(
      '查来源 · 改提示词 · 换模型',
    )
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(handlers.onApprove).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-confirm-secondary'))
    expect(handlers.onDecline).toHaveBeenCalledTimes(1)
    // ⛔ 多步那一支永远不走生成那两颗回调。
    expect(handlers.onConfirm).not.toHaveBeenCalled()
    expect(handlers.onCancel).not.toHaveBeenCalled()
  })

  it('生成 · 默认态：四颗旋钮读数在场，两颗按钮各自走各自的回调', () => {
    const handlers = renderCard(GENERATE)
    const knobs = screen.getAllByTestId('operator-confirm-knob')
    expect(knobs.map((node) => node.dataset.knob)).toEqual([
      'model',
      'aspect',
      'count',
      'resolution',
    ])
    expect(knobs[0]).toHaveTextContent('FLUX 2 Flash')
    expect(knobs[1]).toHaveTextContent('3:2')
    expect(knobs[3]).toHaveTextContent('1536')
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(handlers.onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-confirm-secondary'))
    expect(handlers.onCancel).toHaveBeenCalledTimes(1)
  })

  it('生成入口缺席时禁用确认生成，仍可取消', () => {
    const handlers = renderCard(GENERATE, { canGenerate: false })
    const primary = screen.getByTestId('operator-confirm-primary')
    expect(primary).toBeDisabled()
    fireEvent.click(primary)
    expect(handlers.onConfirm).not.toHaveBeenCalled()
    const secondary = screen.getByTestId('operator-confirm-secondary')
    expect(secondary).toBeEnabled()
    fireEvent.click(secondary)
    expect(handlers.onCancel).toHaveBeenCalledTimes(1)
  })

  it('确认中：两颗按钮都不可点', () => {
    const handlers = renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting,
    })
    const primary = screen.getByTestId('operator-confirm-primary')
    expect(primary).toBeDisabled()
    expect(primary).toHaveTextContent('confirm.state.submitting')
    expect(screen.getByTestId('operator-confirm-secondary')).toBeDisabled()
    fireEvent.click(primary)
    expect(handlers.onConfirm).not.toHaveBeenCalled()
  })

  it('已确认 · 时间：整卡收成一行，⛔ 两颗按钮整个不画', () => {
    renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed,
      decidedAt: '2026-09-11T03:24:00.000Z',
    })
    expect(screen.getByTestId('operator-confirm-state')).toHaveTextContent(
      'confirm.state.confirmed:11:24',
    )
    expect(screen.queryByTestId('operator-confirm-primary')).toBeNull()
    expect(screen.queryByTestId('operator-confirm-secondary')).toBeNull()
    expect(screen.queryByTestId('operator-confirm-retry')).toBeNull()
  })

  it('已取消 · 时间：写「没有执行」，并长一颗「再来一次」', () => {
    const handlers = renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled,
      decidedAt: '2026-09-11T03:22:00.000Z',
    })
    expect(screen.getByTestId('operator-confirm-state')).toHaveTextContent(
      'confirm.state.cancelled:11:24',
    )
    fireEvent.click(screen.getByTestId('operator-confirm-retry'))
    expect(handlers.onRetry).toHaveBeenCalledTimes(1)
  })

  /** ── #9：就地改参数（§5.1 / §5.2）──────────────────────────────── */

  it('⭐ 给了 controls：四颗读的是**工作台**那一份，⛔ 不是载荷里的快照', () => {
    renderCard(
      {
        ...GENERATE,
        request: {
          ...GENERATE.request,
          model: { id: 'stale', label: '旧模型' },
          count: 1,
          specs: {
            aspectRatio: '9:16',
            resolution: '2048',
            durationSeconds: null,
          },
        },
      } as ConfirmCardPrompt,
      { controls: CONTROLS },
    )
    const knobs = screen.getAllByTestId('operator-confirm-knob')
    expect(knobs[0]).toHaveTextContent('FLUX 2 Flash')
    expect(knobs[1]).toHaveTextContent('3:2')
    expect(knobs[2]).toHaveTextContent('confirm.generate.count:3')
    expect(knobs[3]).toHaveTextContent('1536')
  })

  it('⭐ 工作台还没有清晰度读数时**不画那颗旋钮**（⛔ 不是一颗空 chip）', () => {
    renderCard(GENERATE, {
      controls: { ...CONTROLS, resolution: null },
    })
    const knobs = screen.getAllByTestId('operator-confirm-knob')
    expect(knobs.map((node) => node.dataset.knob)).toEqual([
      'model',
      'aspect',
      'count',
    ])
  })

  it('⚠ 模型没有清晰度档时同样不画（候选空）', () => {
    renderCard(GENERATE, {
      controls: {
        ...CONTROLS,
        model: { id: 'seedream-4', label: 'Seedream 4' },
        resolution: null,
      },
    })
    expect(
      screen
        .getAllByTestId('operator-confirm-knob')
        .map((node) => node.dataset.knob),
    ).not.toContain('resolution')
  })

  it('⭐ 模型旋钮写的是**显示名**，⛔ 不是 id', () => {
    renderCard(GENERATE, {
      controls: {
        ...CONTROLS,
        model: { id: 'gpt-image-2.5-flare', label: 'GPT Image 2.5' },
        models: [{ id: 'gpt-image-2.5-flare', label: 'GPT Image 2.5' }],
        choicesByModel: {
          'gpt-image-2.5-flare': {
            aspectRatios: ['3:2'],
            resolutions: [],
            counts: [1],
          },
        },
      },
    })
    const model = screen
      .getAllByTestId('operator-confirm-knob')
      .find((node) => node.dataset.knob === 'model')
    expect(model).toHaveTextContent('GPT Image 2.5')
    expect(model).not.toHaveTextContent('gpt-image-2.5-flare')
  })

  it('⭐ 只做摘要（11-18）：每一格都是只读读数，⛔ 没有下拉、没有可点的旋钮', () => {
    renderCard(GENERATE, { controls: CONTROLS })
    const knobs = screen.getAllByTestId('operator-confirm-knob')
    for (const knob of knobs) {
      expect(knob.tagName).not.toBe('BUTTON')
      fireEvent.click(knob)
    }
    expect(screen.queryByTestId('operator-confirm-knob-menu')).toBeNull()
    expect(screen.queryByRole('menuitemradio')).toBeNull()
    // 卡上能点的只剩「确认 / 取消」。
    expect(
      screen
        .getAllByRole('button')
        .map((node) => node.dataset.testid)
        .sort(),
    ).toEqual(['operator-confirm-primary', 'operator-confirm-secondary'])
  })

  it('⭐ 这一轮助手动过的那几格写「旧值 → 新值」，没动过的只写现值', () => {
    renderCard(GENERATE, {
      controls: CONTROLS,
      origins: { aspect: '1:1', count: '1', model: 'seedream-4' },
    })
    const byKnob = (id: string) =>
      screen
        .getAllByTestId('operator-confirm-knob')
        .find((node) => node.dataset.knob === id)!
    expect(byKnob('aspect')).toHaveAttribute('data-changed', 'true')
    expect(byKnob('aspect')).toHaveTextContent('1:13:2')
    expect(byKnob('count')).toHaveTextContent(
      'confirm.generate.count:1confirm.generate.count:3',
    )
    // 旧模型写显示名（工作台模型表里有它）。
    expect(byKnob('model')).toHaveTextContent('Seedream 4')
    // 分辨率这一轮没动过：只写现值，不画箭头。
    expect(byKnob('resolution')).not.toHaveAttribute('data-changed')
    expect(
      byKnob('resolution').querySelector(
        '[data-testid="operator-confirm-knob-from"]',
      ),
    ).toBeNull()
  })

  it('动过又改回原值：不画箭头（旧值 = 新值不算一次修改）', () => {
    renderCard(GENERATE, {
      controls: CONTROLS,
      origins: { aspect: '3:2' },
    })
    expect(screen.queryByTestId('operator-confirm-knob-from')).toBeNull()
  })

  it('旧值是「没设」：写「模型默认」', () => {
    renderCard(GENERATE, {
      controls: CONTROLS,
      origins: { resolution: null },
    })
    expect(screen.getByTestId('operator-confirm-knob-from')).toHaveTextContent(
      'confirm.generate.modelDefault',
    )
  })

  it('⚠ 候选表为空的那一颗**不画**（这个模型没有它）', () => {
    renderCard(GENERATE, {
      controls: {
        ...CONTROLS,
        model: { id: 'seedream-4', label: 'Seedream 4' },
      },
    })
    // seedream-4 的清晰度与张数候选都空 —— 只剩模型与比例两颗。
    expect(
      screen
        .getAllByTestId('operator-confirm-knob')
        .map((node) => node.dataset.knob),
    ).toEqual(['model', 'aspect'])
  })

  /**
   * ⭐ 画布那一枪：标题写那张画布卡的名字（它可能是视频 / 音频，⛔ 不写「N 张」），
   * 模型写显示名（⛔ 不是快照里那个 id），扳机仍是同一颗「确认生成」。
   */
  it('⭐ 画布那一枪：标题写卡名，模型写显示名，⛔ 不画张数', () => {
    const handlers = renderCard(CANVAS_GENERATE)
    expect(screen.getByTestId('operator-confirm-title')).toHaveTextContent(
      'confirm.generate.titleNode:主角正面',
    )
    const knobs = screen.getAllByTestId('operator-confirm-knob')
    expect(knobs.map((node) => node.dataset.knob)).toEqual(['model'])
    expect(knobs[0]).toHaveTextContent(
      `${getModelMessageKey(AI_MODELS.FLUX_2_FLASH)}.label`,
    )
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(handlers.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('画布那一枪 · 已确认：那一行写「卡名 · 模型」', () => {
    renderCard({
      ...CANVAS_GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed,
      decidedAt: '2026-09-28T03:24:00.000Z',
    })
    expect(screen.getByTestId('operator-confirm-card')).toHaveTextContent(
      `主角正面 · ${getModelMessageKey(AI_MODELS.FLUX_2_FLASH)}.label`,
    )
  })

  it('⚠ 没有 controls（LoRA 装配台）：读数回落到载荷那一份', () => {
    renderCard(GENERATE)
    expect(
      screen
        .getAllByTestId('operator-confirm-knob')
        .map((node) => node.dataset.knob),
    ).toContain('model')
    expect(screen.queryByTestId('operator-confirm-knob-menu')).toBeNull()
  })
})

describe('StudioOperatorConfirmCard 先搜再画（B 定稿）', () => {
  it('关着：卡上不画（开关在工作台上，卡只读）', () => {
    renderCard(GENERATE, {
      controls: CONTROLS,
      searchGrounding: { available: true, on: false, setOn: vi.fn() },
    })
    expect(screen.queryByTestId('operator-confirm-search-grounding')).toBeNull()
  })

  it('开着：摘要里写一格「先搜再画」，⛔ 没有可点的开关', () => {
    const setOn = vi.fn()
    renderCard(GENERATE, {
      controls: CONTROLS,
      searchGrounding: { available: true, on: true, setOn },
    })
    const cell = screen.getByTestId('operator-confirm-search-grounding')
    expect(cell).toHaveTextContent('toggle')
    expect(cell.tagName).not.toBe('BUTTON')
    fireEvent.click(cell)
    expect(setOn).not.toHaveBeenCalled()
  })

  it('画布那一枪不画这一颗（那是卡自己的参数）', () => {
    renderCard(CANVAS_GENERATE, {
      searchGrounding: { available: true, on: false, setOn: vi.fn() },
    })
    expect(screen.queryByTestId('operator-confirm-search-grounding')).toBeNull()
  })

  it('已确认那一行带上「· 先搜再画」', () => {
    renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed,
      decidedAt: '2026-10-07T11:24:00.000Z',
      request: { ...GENERATE.request, searchGrounding: true },
    } as ConfirmCardPrompt)
    expect(screen.getByTestId('operator-confirm-card')).toHaveTextContent(
      'confirmedSuffix',
    )
  })
})

describe('StudioOperatorConfirmCard 首页那份小配方（9g）', () => {
  function makeDraft(
    overrides: Partial<StudioOperatorGenerationDraft> = {},
  ): StudioOperatorGenerationDraft {
    return {
      prompt: '夕阳下的猫',
      references: [{ url: 'https://cdn.example.com/ref.png', name: '图_1' }],
      edited: true,
      openBench: vi.fn(),
      keySetup: null,
      ...overrides,
    }
  }

  it('提示词与参考图只读摆出来（11-18 卡只做摘要），「去图片台接着改」留着', () => {
    const draft = makeDraft()
    renderCard(GENERATE, { controls: CONTROLS, draft })
    const prompt = screen.getByTestId('operator-confirm-draft-prompt')
    expect(prompt).toHaveTextContent('夕阳下的猫')
    expect(prompt.tagName).not.toBe('TEXTAREA')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(
      screen.getAllByTestId('operator-confirm-draft-reference'),
    ).toHaveLength(1)
    expect(
      screen.queryByTestId('operator-confirm-draft-reference-remove'),
    ).toBeNull()
    fireEvent.click(screen.getByTestId('operator-confirm-open-bench'))
    expect(draft.openBench).toHaveBeenCalled()
  })

  it('有 key：「出图」直接扣扳机', () => {
    const view = renderCard(GENERATE, {
      controls: CONTROLS,
      draft: makeDraft(),
    })
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(view.onConfirm).toHaveBeenCalledTimes(1)
    expect(openQuickSetup()).toBeNull()
  })

  it('⭐ 没 key：先就地配，配好选上那把 key 再出', async () => {
    const onVerified = vi.fn()
    const view = renderCard(GENERATE, {
      controls: CONTROLS,
      draft: makeDraft({
        keySetup: {
          modelId: 'flux-2-flash',
          optionId: 'model:flux-2-flash',
          modelLabel: 'FLUX 2 Flash',
          adapterType: AI_ADAPTER_TYPES.FAL,
          onVerified,
        },
      }),
    })
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(view.onConfirm).not.toHaveBeenCalled()
    expect(openQuickSetup()).toHaveTextContent('title:FLUX 2 Flash')

    submitQuickSetup('verify')
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('k-new'))
    expect(keysApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'flux-2-flash' }),
    )
    expect(view.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('没给配方（台开着）：卡上没有这一块', () => {
    renderCard(GENERATE, { controls: CONTROLS })
    expect(screen.queryByTestId('operator-confirm-draft')).toBeNull()
    expect(screen.queryByTestId('operator-confirm-open-bench')).toBeNull()
  })
})
